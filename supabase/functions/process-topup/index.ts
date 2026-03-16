import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, data?: Record<string, unknown>) {
  const entry = { timestamp: new Date().toISOString(), level, function: 'process-topup', message, ...data };
  if (level === 'ERROR') console.error(JSON.stringify(entry));
  else if (level === 'WARN') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

const G2BULK_API_URL = 'https://api.g2bulk.com/v1';

async function sendTelegramNotification(message: string, isError: boolean = false) {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!botToken || !chatId) return;
  const emoji = isError ? '❌' : '✅';
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: `${emoji} ${message}`, parse_mode: 'HTML' })
    });
  } catch (error) {
    console.error('[Telegram] Error:', error);
  }
}

async function getProductType(supabase: any, productId: string): Promise<'card' | 'recharge'> {
  const { data: product } = await supabase
    .from('g2bulk_products')
    .select('product_type')
    .eq('g2bulk_product_id', productId)
    .maybeSingle();
  return product?.product_type === 'card' ? 'card' : 'recharge';
}

// Auto refund wallet if order was paid via wallet
async function autoRefundWallet(supabase: any, order: any, tableName: string = 'topup_orders') {
  if (order.payment_method !== 'Wallet' || !order.user_id) return;
  try {
    log('INFO', 'Processing auto wallet refund', { orderId: order.id, amount: order.amount });
    const { data: profile } = await supabase.from('profiles').select('wallet_balance').eq('user_id', order.user_id).single();
    if (!profile) return;
    const currentBalance = profile.wallet_balance || 0;
    const refundAmount = Math.abs(order.amount);
    const newBalance = currentBalance + refundAmount;
    await supabase.from('wallet_transactions').insert({
      user_id: order.user_id, type: 'refund', amount: refundAmount,
      balance_before: currentBalance, balance_after: newBalance,
      description: `Auto refund for failed order: ${order.game_name} - ${order.package_name}`,
      reference_id: `refund-${order.id}`
    });
    log('INFO', 'Wallet refund successful', { userId: order.user_id, refundAmount, newBalance });
    await sendTelegramNotification(
      `<b>💰 Auto Wallet Refund</b>\n🎮 Game: ${order.game_name}\n📦 Package: ${order.package_name}\n👤 Player: ${order.player_id}\n💵 Refund: $${refundAmount.toFixed(2)}\n💰 New Balance: $${newBalance.toFixed(2)}\n🔢 Order ID: ${order.id}`
    );
  } catch (error: any) {
    log('ERROR', 'Auto refund error', { error: error.message, orderId: order.id });
  }
}

// ============ QUANTITY RESOLUTION ============
async function resolveQuantity(supabase: any, g2bulkProductId: string, packageName: string): Promise<number> {
  // 1. Exact match: both g2bulk_product_id AND package_name in packages
  const { data: exactPkg } = await supabase
    .from('packages')
    .select('quantity')
    .eq('g2bulk_product_id', g2bulkProductId)
    .eq('name', packageName)
    .maybeSingle();
  if (exactPkg?.quantity && exactPkg.quantity > 0) return exactPkg.quantity;

  // 2. First match by g2bulk_product_id only in packages
  const { data: prodPkg } = await supabase
    .from('packages')
    .select('quantity')
    .eq('g2bulk_product_id', g2bulkProductId)
    .limit(1)
    .maybeSingle();
  if (prodPkg?.quantity && prodPkg.quantity > 0) return prodPkg.quantity;

  // 3. Check special_packages
  const { data: spkg } = await supabase
    .from('special_packages')
    .select('quantity')
    .eq('g2bulk_product_id', g2bulkProductId)
    .limit(1)
    .maybeSingle();
  if (spkg?.quantity && spkg.quantity > 0) return spkg.quantity;

  // 4. Check preorder_packages
  const { data: ppkg } = await supabase
    .from('preorder_packages')
    .select('quantity')
    .eq('g2bulk_product_id', g2bulkProductId)
    .limit(1)
    .maybeSingle();
  if (ppkg?.quantity && ppkg.quantity > 0) return ppkg.quantity;

  // 5. Parse from package name using regex
  const match = packageName.match(/[x×](\d+)|(\d+)[x×]/i);
  if (match) {
    const qty = parseInt(match[1] || match[2]);
    if (qty > 0) return qty;
  }

  // 6. Default
  return 1;
}

// ============ ATOMIC LOCK ============
async function acquireFulfillmentLock(supabase: any, orderId: string, tableName: string): Promise<any | null> {
  const { data: lockResult } = await supabase
    .from(tableName)
    .update({ status: 'processing', status_message: 'Acquiring fulfillment lock...' })
    .eq('id', orderId)
    .in('status', ['paid', 'pending', 'notpaid'])
    .select('*');

  if (!lockResult || lockResult.length === 0) {
    log('WARN', 'Could not acquire lock - already processing', { orderId, tableName });
    return null;
  }
  return lockResult[0];
}

// Fulfill card/voucher order
async function fulfillCardOrder(supabase: any, orderId: string, order: any, apiKey: string, tableName: string = 'topup_orders') {
  const productId = order.g2bulk_product_id.replace('card_', '');
  const response = await fetch(`${G2BULK_API_URL}/products/${productId}/purchase`, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ quantity: 1 })
  });
  const result = await response.json();

  if (result.success) {
    const g2bulkOrderId = result.order_id || result.transaction_id;
    const deliveryItems = result.delivery_items || [];
    let cardCodesJson: any = null;
    if (deliveryItems.length > 0) {
      cardCodesJson = deliveryItems.map((item: string) => ({ code: item, serial: '', expire: '' }));
    }
    // Don't update status here - let the caller handle multi-quantity status
    return { success: true, g2bulk_order_id: g2bulkOrderId, cards: cardCodesJson };
  } else {
    const errorMsg = result.message || result.detail?.message || 'Card purchase failed';
    return { success: false, error: errorMsg };
  }
}

// Fulfill direct game recharge order
async function fulfillRechargeOrder(supabase: any, orderId: string, order: any, apiKey: string, tableName: string = 'topup_orders') {
  let gameCode = '';
  let catalogueName = '';

  const { data: g2bulkProduct } = await supabase
    .from('g2bulk_products')
    .select('fields, product_name, g2bulk_product_id')
    .eq('g2bulk_product_id', order.g2bulk_product_id)
    .maybeSingle();

  if (g2bulkProduct) {
    if (g2bulkProduct.fields?.game_code) gameCode = g2bulkProduct.fields.game_code;
    if (g2bulkProduct.product_name) catalogueName = g2bulkProduct.product_name;
  }

  // Fallback: parse game_code from product ID "game_CODE_typeId"
  if (!gameCode && order.g2bulk_product_id?.startsWith('game_')) {
    const parts = order.g2bulk_product_id.split('_');
    if (parts.length >= 3) gameCode = parts.slice(1, -1).join('_');
  }

  if (gameCode && !catalogueName) {
    const { data: exactMatch } = await supabase
      .from('g2bulk_products').select('product_name').eq('g2bulk_product_id', order.g2bulk_product_id).maybeSingle();
    if (exactMatch?.product_name) catalogueName = exactMatch.product_name;
    else {
      const { data: pkg } = await supabase.from('packages').select('name').eq('g2bulk_product_id', order.g2bulk_product_id).maybeSingle();
      if (pkg?.name) catalogueName = pkg.name;
    }
  }

  if (!gameCode || !catalogueName) {
    return { success: false, error: `Could not resolve game_code (${gameCode || 'none'}) or catalogue_name (${catalogueName || 'none'}) for product: ${order.g2bulk_product_id}` };
  }

  const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/g2bulk-webhook`;
  const orderBody: Record<string, string> = {
    catalogue_name: catalogueName,
    player_id: order.player_id,
    remark: `order_id:${orderId}`,
    callback_url: callbackUrl,
  };
  if (order.server_id) orderBody.server_id = order.server_id;

  const response = await fetch(`${G2BULK_API_URL}/games/${gameCode}/order`, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(orderBody)
  });
  const result = await response.json();

  if (result.success && result.order) {
    const g2bulkOrderId = result.order.order_id;
    const status = result.order.status;
    let finalStatus = 'processing';
    if (status === 'COMPLETED') finalStatus = 'completed';
    else if (status === 'FAILED') finalStatus = 'failed';
    return { success: finalStatus !== 'failed', g2bulk_order_id: g2bulkOrderId, status: finalStatus };
  } else {
    const errorMsg = result.message || result.detail?.message || JSON.stringify(result);
    return { success: false, error: errorMsg };
  }
}

// ============ MAIN FULFILLMENT (handles both regular and preorder) ============
async function fulfillOrder(supabase: any, orderId: string, options: { isPreorder?: boolean } = {}) {
  const tableName = options.isPreorder ? 'preorder_orders' : 'topup_orders';
  log('INFO', `Starting fulfillment`, { orderId, tableName });

  // ATOMIC LOCK - prevents race conditions
  const order = await acquireFulfillmentLock(supabase, orderId, tableName);
  if (!order) {
    log('WARN', 'Fulfillment already in progress or completed', { orderId });
    return { success: false, error: 'Already processing' };
  }

  let g2bulkProductId: string | null = order.g2bulk_product_id;

  // Resolve g2bulk_product_id if missing
  if (!g2bulkProductId) {
    const { data: pkg } = await supabase
      .from('packages')
      .select('g2bulk_product_id, games!inner(name)')
      .eq('name', order.package_name)
      .eq('games.name', order.game_name)
      .maybeSingle();
    if (pkg?.g2bulk_product_id) g2bulkProductId = pkg.g2bulk_product_id;
    else {
      const { data: spkg } = await supabase
        .from('special_packages')
        .select('g2bulk_product_id, games!inner(name)')
        .eq('name', order.package_name)
        .eq('games.name', order.game_name)
        .maybeSingle();
      if (spkg?.g2bulk_product_id) g2bulkProductId = spkg.g2bulk_product_id;
    }
    if (g2bulkProductId) {
      await supabase.from(tableName).update({ g2bulk_product_id: g2bulkProductId }).eq('id', orderId);
    }
  }

  if (!g2bulkProductId) {
    await supabase.from(tableName).update({
      status: 'pending_manual',
      status_message: 'No G2Bulk product linked. Manual fulfillment required.'
    }).eq('id', orderId);
    return { success: true, status: 'pending_manual' };
  }

  // Get API config
  const { data: apiConfig } = await supabase
    .from('api_configurations').select('*').eq('api_name', 'g2bulk').maybeSingle();
  if (!apiConfig?.is_enabled || !apiConfig.api_secret) {
    await supabase.from(tableName).update({
      status: 'pending_manual',
      status_message: 'G2Bulk API not configured. Manual fulfillment required.'
    }).eq('id', orderId);
    return { success: true, status: 'pending_manual' };
  }

  const apiKey = apiConfig.api_secret;

  try {
    // Use fulfill_quantity from order record if available, otherwise fall back to resolveQuantity
    let fulfillQuantity = 1;
    if (order.fulfill_quantity && order.fulfill_quantity > 0) {
      fulfillQuantity = order.fulfill_quantity;
    } else {
      fulfillQuantity = await resolveQuantity(supabase, g2bulkProductId, order.package_name);
    }
    log('INFO', `Fulfilling x${fulfillQuantity}`, { orderId, g2bulkProductId, source: order.fulfill_quantity ? 'order_record' : 'resolved' });

    await supabase.from(tableName).update({
      status: 'processing',
      status_message: `Sending to G2Bulk (x${fulfillQuantity})...`
    }).eq('id', orderId);

    const orderForFulfillment = { ...order, g2bulk_product_id: g2bulkProductId };
    const productType = await getProductType(supabase, g2bulkProductId);

    const results: any[] = [];
    let successCount = 0;
    let failedAt = -1;

    for (let i = 0; i < fulfillQuantity; i++) {
      log('INFO', `Fulfilling ${i + 1}/${fulfillQuantity}`, { orderId });

      let result;
      if (productType === 'card') {
        result = await fulfillCardOrder(supabase, orderId, orderForFulfillment, apiKey, tableName);
      } else {
        result = await fulfillRechargeOrder(supabase, orderId, orderForFulfillment, apiKey, tableName);
      }
      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failedAt = i + 1;
        break;
      }

      if (i < fulfillQuantity - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    const g2bulkOrderIds = results.map(r => r.g2bulk_order_id).filter(Boolean).join(', ');
    const allCardCodes = results.flatMap(r => r.cards || []);

    if (successCount === fulfillQuantity) {
      // All succeeded
      await supabase.from(tableName).update({
        status: 'completed',
        g2bulk_order_id: g2bulkOrderIds,
        status_message: fulfillQuantity > 1
          ? `All ${fulfillQuantity} fulfillments completed. Orders: ${g2bulkOrderIds}`
          : `Completed. Order: ${g2bulkOrderIds}`,
        ...(allCardCodes.length > 0 ? { card_codes: allCardCodes } : {})
      }).eq('id', orderId);

      await sendTelegramNotification(
        `<b>${fulfillQuantity > 1 ? `Bundle x${fulfillQuantity}` : 'Order'} Completed</b>\n` +
        `🎮 Game: ${order.game_name}\n📦 Package: ${order.package_name}\n` +
        `👤 Player: ${order.player_id}\n💰 Amount: $${order.amount}\n` +
        `📋 G2Bulk: ${g2bulkOrderIds}`
      );
      return { success: true, g2bulk_order_id: g2bulkOrderIds, status: 'completed' };
    } else if (successCount > 0) {
      // Partial success
      const errorMsg = results[results.length - 1]?.error || 'Unknown';
      await supabase.from(tableName).update({
        status: 'partial',
        g2bulk_order_id: g2bulkOrderIds,
        status_message: `Partial: ${successCount}/${fulfillQuantity} succeeded. Failed at #${failedAt}: ${errorMsg}`,
        ...(allCardCodes.length > 0 ? { card_codes: allCardCodes } : {})
      }).eq('id', orderId);

      await sendTelegramNotification(
        `<b>⚠️ Partial Fulfillment (${successCount}/${fulfillQuantity})</b>\n` +
        `🎮 Game: ${order.game_name}\n📦 Package: ${order.package_name}\n` +
        `👤 Player: ${order.player_id}\n💰 Amount: $${order.amount}\n` +
        `⚠️ Failed at #${failedAt}: ${errorMsg}`, true
      );
      return { success: false, status: 'partial', successCount, total: fulfillQuantity };
    } else {
      // All failed
      const errorMsg = results[0]?.error || 'Fulfillment failed';
      await supabase.from(tableName).update({
        status: 'failed',
        status_message: `Failed: ${errorMsg}`
      }).eq('id', orderId);

      await sendTelegramNotification(
        `<b>Order Failed</b>\n🎮 Game: ${order.game_name}\n📦 Package: ${order.package_name}\n` +
        `👤 Player: ${order.player_id}\n💰 Amount: $${order.amount}\n⚠️ Error: ${errorMsg}`, true
      );
      await autoRefundWallet(supabase, order, tableName);
      return { success: false, error: errorMsg };
    }
  } catch (g2bulkError: any) {
    log('ERROR', 'Fulfillment error', { error: g2bulkError.message });
    await supabase.from(tableName).update({
      status: 'failed',
      status_message: `Error: ${g2bulkError.message || 'Unknown error'}`
    }).eq('id', orderId);
    await autoRefundWallet(supabase, order, tableName);
    return { success: false, error: g2bulkError.message };
  }
}

// Resolve game_code from g2bulk_product_id
async function resolveGameCode(supabase: any, g2bulkProductId: string): Promise<string | null> {
  // 1. Try g2bulk_products table first (most reliable)
  const { data: product } = await supabase
    .from('g2bulk_products')
    .select('fields')
    .eq('g2bulk_product_id', g2bulkProductId)
    .maybeSingle();
  if (product?.fields?.game_code) return product.fields.game_code;

  // 2. Fallback: parse from product ID format "game_CODE_typeId"
  if (g2bulkProductId.startsWith('game_')) {
    const parts = g2bulkProductId.split('_');
    if (parts.length >= 3) return parts.slice(1, -1).join('_');
  }
  return null;
}

// Check G2Bulk order status (handles comma-separated multi-quantity order IDs)
async function checkG2BulkOrderStatus(supabase: any, orderId: string) {
  const { data: order } = await supabase.from('topup_orders').select('*').eq('id', orderId).single();
  if (!order?.g2bulk_order_id) return { success: false, error: 'No G2Bulk order ID found' };

  const { data: apiConfig } = await supabase.from('api_configurations').select('*').eq('api_name', 'g2bulk').single();
  if (!apiConfig?.is_enabled || !apiConfig.api_secret) return { success: false, error: 'G2Bulk not configured' };

  const gameCode = order.g2bulk_product_id ? await resolveGameCode(supabase, order.g2bulk_product_id) : null;
  if (!gameCode) return { success: false, error: 'Could not determine game code' };

  // Handle comma-separated order IDs from multi-quantity fulfillments
  const orderIds = String(order.g2bulk_order_id).split(',').map((id: string) => id.trim()).filter(Boolean);
  let worstStatus = 'COMPLETED';
  let lastMessage = '';

  for (const g2OrderId of orderIds) {
    const parsedId = parseInt(g2OrderId);
    if (isNaN(parsedId)) continue;

    try {
      const response = await fetch(`${G2BULK_API_URL}/games/order/status`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-API-Key': apiConfig.api_secret },
        body: JSON.stringify({ order_id: parsedId, game: gameCode })
      });

      if (!response.ok) {
        log('WARN', `G2Bulk API returned ${response.status} for order ${g2OrderId}`);
        worstStatus = 'PROCESSING';
        continue;
      }

      const result = await response.json();
      if (result.success && result.order) {
        const s = result.order.status;
        lastMessage = result.order.message || '';
        if (s === 'FAILED') { worstStatus = 'FAILED'; break; }
        if ((s === 'PROCESSING' || s === 'PENDING') && worstStatus !== 'FAILED') worstStatus = s;
      } else {
        lastMessage = result.message || 'Unknown error';
      }
    } catch (err) {
      log('ERROR', `Error checking sub-order ${g2OrderId}`, { error: String(err) });
      worstStatus = 'PROCESSING';
    }
  }

  let finalStatus = order.status;
  if (worstStatus === 'COMPLETED') finalStatus = 'completed';
  else if (worstStatus === 'FAILED') finalStatus = 'failed';

  const statusMsg = `G2Bulk Status: ${worstStatus}${lastMessage ? ` - ${lastMessage}` : ''}`;
  await supabase.from('topup_orders').update({ status: finalStatus, status_message: statusMsg }).eq('id', orderId);
  return { success: true, g2bulk_status: worstStatus, our_status: finalStatus };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();

    // Handle fulfill action
    if (body.action === 'fulfill' && body.orderId) {
      log('INFO', 'Fulfill action', { orderId: body.orderId, isPreorder: body.isPreorder });
      const result = await fulfillOrder(supabase, body.orderId, { isPreorder: body.isPreorder });
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Handle check_status action
    if (body.action === 'check_status' && body.orderId) {
      const result = await checkG2BulkOrderStatus(supabase, body.orderId);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Handle process-preorders action (called by cron)
    if (body.action === 'process_preorders') {
      log('INFO', 'Processing due preorders...');
      const { data: dueOrders } = await supabase
        .from('preorder_orders')
        .select('*')
        .eq('status', 'paid')
        .not('scheduled_fulfill_at', 'is', null)
        .lte('scheduled_fulfill_at', new Date().toISOString())
        .limit(20);

      if (!dueOrders || dueOrders.length === 0) {
        return new Response(JSON.stringify({ success: true, processed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      log('INFO', `Found ${dueOrders.length} due preorders`);
      const results: any[] = [];
      for (const order of dueOrders) {
        const result = await fulfillOrder(supabase, order.id, { isPreorder: true });
        results.push({ orderId: order.id, ...result });
      }
      return new Response(JSON.stringify({ success: true, processed: dueOrders.length, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Handle create order (regular or preorder)
    const {
      game_name, package_name, player_id, server_id, player_name,
      amount, currency, payment_method, g2bulk_product_id, user_id,
      is_preorder, scheduled_fulfill_at, fulfill_quantity
    } = body;

    // Guard: required fields must be present
    if (!game_name || !package_name || !player_id) {
      log('ERROR', 'Missing required fields for order creation', { game_name, package_name, player_id });
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: game_name, package_name, player_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    log('INFO', 'Creating order', { game_name, package_name, is_preorder, fulfill_quantity });

    const tableName = is_preorder ? 'preorder_orders' : 'topup_orders';
    const resolvedQty = (fulfill_quantity && fulfill_quantity > 0) ? fulfill_quantity : 1;
    const insertData: any = {
      game_name, package_name, player_id, server_id, player_name, amount,
      currency: currency || 'USD', payment_method,
      g2bulk_product_id: g2bulk_product_id || null,
      user_id: user_id || null,
      status: 'pending',
      fulfill_quantity: resolvedQty
    };
    if (is_preorder && scheduled_fulfill_at) {
      insertData.scheduled_fulfill_at = scheduled_fulfill_at;
    }

    const { data: order, error: orderError } = await supabase
      .from(tableName).insert(insertData).select().single();

    if (orderError) {
      log('ERROR', 'Order creation error', { error: orderError.message });
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create order' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true, order_id: order.id, status: 'pending',
        has_g2bulk: !!g2bulk_product_id, is_preorder: !!is_preorder,
        message: is_preorder ? 'Pre-order created. Awaiting payment.' : 'Order created. Awaiting payment confirmation.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    log('ERROR', 'Unexpected error', { error: String(error) });
    return new Response(
      JSON.stringify({ success: false, error: 'An unexpected error occurred.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
