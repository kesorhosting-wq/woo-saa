import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, Authorization",
};

// Structured logging helper
function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, data?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    function: 'ikhode-webhook',
    message,
    ...data,
  };
  if (level === 'ERROR') {
    console.error(JSON.stringify(entry));
  } else if (level === 'WARN') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const G2BULK_API_URL = 'https://api.g2bulk.com/v1';

// Telegram notification function
async function sendTelegramNotification(message: string, isError: boolean = false) {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  
  if (!botToken || !chatId) {
    log('DEBUG', 'Telegram not configured, skipping notification');
    return;
  }

  const emoji = isError ? '❌' : '✅';
  const formattedMessage = `${emoji} ${message}`;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: formattedMessage,
        parse_mode: 'HTML'
      })
    });
    log('INFO', 'Telegram notification sent');
  } catch (error) {
    log('ERROR', 'Failed to send Telegram notification', { error: String(error) });
  }
}

// Fulfill G2Bulk order directly (inline, not via function invoke)
async function fulfillG2BulkOrder(supabase: any, orderId: string) {
  log('INFO', '========== STARTING G2BULK FULFILLMENT ==========', { orderId });
  
  const { data: order, error: orderError } = await supabase
    .from('topup_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();
  
  if (orderError || !order) {
    log('ERROR', 'Order not found', { error: orderError?.message });
    return { success: false, error: 'Order not found' };
  }

  log('INFO', 'Order found', { 
    id: order.id, 
    g2bulk_product_id: order.g2bulk_product_id, 
    status: order.status 
  });

  const g2bulkProductId = order.g2bulk_product_id;

  if (!g2bulkProductId) {
    log('WARN', 'No G2Bulk product linked, marking as manual fulfillment');
    await supabase
      .from('topup_orders')
      .update({ 
        status: 'pending_manual',
        status_message: 'Payment confirmed. No G2Bulk product linked. Manual fulfillment required.'
      })
      .eq('id', orderId);
    return { success: true, status: 'pending_manual' };
  }

  // Get G2Bulk API config
  const { data: apiConfig } = await supabase
    .from('api_configurations')
    .select('*')
    .eq('api_name', 'g2bulk')
    .maybeSingle();

  if (!apiConfig?.is_enabled || !apiConfig.api_secret) {
    log('WARN', 'G2Bulk not configured');
    await supabase
      .from('topup_orders')
      .update({ 
        status: 'pending_manual',
        status_message: 'Payment confirmed. G2Bulk API not configured. Manual fulfillment required.'
      })
      .eq('id', orderId);
    return { success: true, status: 'pending_manual' };
  }

  const apiKey = apiConfig.api_secret;

  try {
    // Update order to processing
    await supabase
      .from('topup_orders')
      .update({ 
        status: 'processing',
        status_message: 'Sending to G2Bulk for fulfillment...'
      })
      .eq('id', orderId);

    // Get product details from g2bulk_products
    const { data: g2bulkProduct } = await supabase
      .from('g2bulk_products')
      .select('fields, product_name, product_type')
      .eq('g2bulk_product_id', g2bulkProductId)
      .maybeSingle();

    let gameCode = '';
    let catalogueName = '';

    if (g2bulkProduct) {
      if (g2bulkProduct.fields?.game_code) {
        gameCode = g2bulkProduct.fields.game_code;
      }
      if (g2bulkProduct.product_name) {
        catalogueName = g2bulkProduct.product_name;
      }
    }

    // Fallback: extract from product ID
    if (!gameCode && g2bulkProductId?.startsWith('game_')) {
      const parts = g2bulkProductId.split('_');
      if (parts.length >= 3) {
        gameCode = parts.slice(1, -1).join('_');
      }
    }

    log('INFO', 'Product info', { gameCode, catalogueName, productType: g2bulkProduct?.product_type });

    // Check if it's a card/voucher type
    const isCardType = g2bulkProduct?.product_type === 'card' || g2bulkProductId?.startsWith('card_');

    if (isCardType) {
      // Card purchase
      const productId = g2bulkProductId.replace('card_', '');
      
      const response = await fetch(`${G2BULK_API_URL}/products/${productId}/purchase`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({ quantity: 1 })
      });

      const result = await response.json();
      log('INFO', 'G2Bulk card response', { result });

      if (result.success) {
        const g2bulkOrderId = result.order_id || result.transaction_id;
        const deliveryItems = result.delivery_items || [];
        
        let cardCodesJson: any = null;
        if (deliveryItems.length > 0) {
          cardCodesJson = deliveryItems.map((item: string) => ({
            code: item,
            serial: '',
            expire: ''
          }));
        }

        await supabase
          .from('topup_orders')
          .update({ 
            g2bulk_order_id: String(g2bulkOrderId),
            status: 'completed',
            status_message: `G2Bulk Card Order: ${g2bulkOrderId}. ${deliveryItems.length} code(s) delivered.`,
            card_codes: cardCodesJson
          })
          .eq('id', orderId);

        await sendTelegramNotification(
          `<b>Card Order Completed</b>\n` +
          `🎮 Game: ${order.game_name}\n` +
          `📦 Package: ${order.package_name}\n` +
          `👤 Player: ${order.player_id}\n` +
          `💰 Amount: $${order.amount}\n` +
          `🔢 Order ID: ${orderId}\n` +
          `🎫 Codes: ${deliveryItems.length} delivered`
        );

        return { success: true, g2bulk_order_id: g2bulkOrderId, status: 'completed' };
      } else {
        const errorMsg = result.message || result.detail?.message || 'Card purchase failed';
        await supabase
          .from('topup_orders')
          .update({ 
            status: 'failed',
            status_message: `G2Bulk Card Error: ${errorMsg}`
          })
          .eq('id', orderId);
        
        await sendTelegramNotification(
          `<b>Card Order Failed</b>\n` +
          `🎮 Game: ${order.game_name}\n` +
          `💰 Amount: $${order.amount}\n` +
          `⚠️ Error: ${errorMsg}`,
          true
        );

        return { success: false, error: errorMsg };
      }
    } else {
      // Game recharge
      if (!gameCode || !catalogueName) {
        const errorMsg = `Could not determine game_code or catalogue_name for product: ${g2bulkProductId}`;
        log('ERROR', errorMsg);
        await supabase
          .from('topup_orders')
          .update({ 
            status: 'failed',
            status_message: errorMsg
          })
          .eq('id', orderId);
        return { success: false, error: errorMsg };
      }

      const callbackUrl = `${SUPABASE_URL}/functions/v1/g2bulk-webhook`;

      const orderBody: Record<string, string> = {
        catalogue_name: catalogueName,
        player_id: order.player_id,
        remark: `order_id:${orderId}`,
        callback_url: callbackUrl,
      };

      if (order.server_id) {
        orderBody.server_id = order.server_id;
      }

      log('INFO', 'Sending to G2Bulk', { 
        url: `${G2BULK_API_URL}/games/${gameCode}/order`,
        body: orderBody 
      });

      const response = await fetch(`${G2BULK_API_URL}/games/${gameCode}/order`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(orderBody)
      });

      const result = await response.json();
      log('INFO', 'G2Bulk recharge response', { result });

      if (result.success && result.order) {
        const g2bulkOrderId = result.order.order_id;
        const status = result.order.status;
        
        let finalStatus = 'processing';
        let statusMessage = `G2Bulk Order: ${g2bulkOrderId}. Status: ${status}`;
        
        if (status === 'COMPLETED') {
          finalStatus = 'completed';
          statusMessage = `Successfully delivered via G2Bulk. Order: ${g2bulkOrderId}`;
        } else if (status === 'FAILED') {
          finalStatus = 'failed';
          statusMessage = `G2Bulk delivery failed. Order: ${g2bulkOrderId}`;
        }

        await supabase
          .from('topup_orders')
          .update({ 
            g2bulk_order_id: String(g2bulkOrderId),
            status: finalStatus,
            status_message: statusMessage
          })
          .eq('id', orderId);

        if (finalStatus === 'completed') {
          await sendTelegramNotification(
            `<b>Recharge Order Completed</b>\n` +
            `🎮 Game: ${order.game_name}\n` +
            `📦 Package: ${order.package_name}\n` +
            `👤 Player: ${order.player_id}${order.server_id ? ` (Server: ${order.server_id})` : ''}\n` +
            `💰 Amount: $${order.amount}\n` +
            `📋 G2Bulk Order: ${g2bulkOrderId}`
          );
        }

        return { success: true, g2bulk_order_id: g2bulkOrderId, status: finalStatus };
      } else {
        const errorMsg = result.message || result.detail?.message || JSON.stringify(result);
        log('ERROR', 'G2Bulk Error', { errorMsg });
        await supabase
          .from('topup_orders')
          .update({ 
            status: 'failed',
            status_message: `G2Bulk Error: ${errorMsg}`
          })
          .eq('id', orderId);

        await sendTelegramNotification(
          `<b>Recharge Order Failed</b>\n` +
          `🎮 Game: ${order.game_name}\n` +
          `💰 Amount: $${order.amount}\n` +
          `⚠️ Error: ${errorMsg}`,
          true
        );

        return { success: false, error: errorMsg };
      }
    }
  } catch (g2bulkError: any) {
    log('ERROR', 'G2Bulk processing error', { error: g2bulkError.message });
    await supabase
      .from('topup_orders')
      .update({ 
        status: 'failed',
        status_message: `G2Bulk error: ${g2bulkError.message || 'Unknown error'}`
      })
      .eq('id', orderId);
    return { success: false, error: g2bulkError.message };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Extract order_id from URL path
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const orderIdFromPath = pathParts[pathParts.length - 1];

    log('INFO', 'Webhook received', { orderIdFromPath, method: req.method });

    // 1. Get our stored secret from payment_gateways config
    const { data: gateway } = await supabase
      .from("payment_gateways")
      .select("config")
      .eq("slug", "ikhode-bakong")
      .maybeSingle();

    const expectedSecret = (gateway?.config as any)?.webhook_secret || "";

    // 2. Authorization Check (using Bearer token)
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") || "";

    log('DEBUG', 'Auth check', { 
      hasExpectedSecret: !!expectedSecret, 
      hasToken: !!token,
      match: token === expectedSecret
    });

    if (expectedSecret && token !== expectedSecret) {
      log('ERROR', 'Unauthorized: Invalid secret key');
      return new Response(
        JSON.stringify({ status: "error", message: "Unauthorized: Invalid secret key." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse payload early (needed for wallet topup check)
    let payload: any = {};
    try {
      payload = await req.json();
      log('DEBUG', 'Webhook payload', { payload });
    } catch (e) {
      log('WARN', 'No JSON payload in request body');
    }

    // 3. Check if this is a wallet top-up or regular order
    const isWalletTopup = orderIdFromPath?.startsWith("wallet-");
    
    if (isWalletTopup) {
      // Handle wallet top-up
      log('INFO', 'Processing wallet top-up', { orderIdFromPath });
      
      const parts = orderIdFromPath.split("-");
      if (parts.length < 3) {
        log('ERROR', 'Invalid wallet order ID format', { orderIdFromPath });
        return new Response(
          JSON.stringify({ status: "error", message: "Invalid wallet order ID format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const userIdPrefix = parts[1];
      
      const amount = parseFloat(payload.amount) || 0;
      const transactionId = payload.transaction_id || payload.transactionId || orderIdFromPath;
      
      if (amount <= 0) {
        log('ERROR', 'Invalid amount for wallet topup', { amount });
        return new Response(
          JSON.stringify({ status: "error", message: "Invalid amount" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, wallet_balance")
        .like("user_id", `${userIdPrefix}%`);
      
      if (profileError || !profiles || profiles.length === 0) {
        log('ERROR', 'User not found for wallet topup', { userIdPrefix });
        return new Response(
          JSON.stringify({ status: "error", message: "User not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const userProfile = profiles[0];
      const currentBalance = userProfile.wallet_balance || 0;
      const newBalance = currentBalance + amount;
      
      const { error: txError } = await supabase
        .from("wallet_transactions")
        .insert({
          user_id: userProfile.user_id,
          type: "topup",
          amount: amount,
          balance_before: currentBalance,
          balance_after: newBalance,
          description: `KHQR Wallet Top-up - Transaction: ${transactionId}`,
          reference_id: orderIdFromPath
        });
      
      if (txError) {
        log('ERROR', 'Failed to create wallet transaction', { error: txError.message });
        return new Response(
          JSON.stringify({ status: "error", message: "Failed to process wallet top-up" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      log('INFO', 'Wallet topup successful', { userId: userProfile.user_id, amount, newBalance });
      
      return new Response(
        JSON.stringify({ status: "success", message: "Wallet top-up completed", newBalance }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Regular order processing
    let order = null;

    if (orderIdFromPath && orderIdFromPath !== "ikhode-webhook") {
      const { data } = await supabase
        .from("topup_orders")
        .select("*")
        .eq("id", orderIdFromPath)
        .maybeSingle();
      order = data;
    }

    if (!order) {
      log('ERROR', 'Order not found', { orderIdFromPath });
      return new Response(
        JSON.stringify({ status: "error", message: "Order not found or could not be resolved." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log('INFO', 'Found Order', { orderId: order.id, status: order.status, g2bulk_product_id: order.g2bulk_product_id });

    // 4. Already Processed Check
    const processableStatuses = ["pending", "paid"];
    if (!processableStatuses.includes(order.status)) {
      log('INFO', 'Order already processed', { orderId: order.id, status: order.status });
      return new Response(
        JSON.stringify({ status: "success", message: `Order already ${order.status}.` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log('INFO', 'Order is processable, proceeding with fulfillment', { status: order.status });

    const transactionId = payload.transaction_id || payload.transactionId || "N/A";
    const amount = payload.amount || order.amount;

    log('INFO', 'Processing payment', { amount, transactionId });

    // Send Telegram notification for payment received
    await sendTelegramNotification(
      `<b>💰 Payment Received</b>\n` +
      `🎮 Game: ${order.game_name}\n` +
      `📦 Package: ${order.package_name}\n` +
      `👤 Player: ${order.player_id}${order.server_id ? ` (Server: ${order.server_id})` : ''}\n` +
      `💵 Amount: $${order.amount}\n` +
      `🔢 Order ID: ${order.id}\n` +
      `💳 Transaction: ${transactionId}\n` +
      `⏳ Auto-processing...`
    );

    // 5. Update order to paid first
    await supabase
      .from("topup_orders")
      .update({
        status: "paid",
        payment_method: "Xavier KHQR",
        status_message: `Payment confirmed. Transaction: ${transactionId}. Starting fulfillment...`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    log('INFO', 'Payment recorded, starting G2Bulk fulfillment', { orderId: order.id });

    // 6. Fulfill G2Bulk order directly (not via function invoke to avoid internal call issues)
    const fulfillResult = await fulfillG2BulkOrder(supabase, order.id);
    
    log('INFO', 'Fulfillment result', { fulfillResult });

    return new Response(
      JSON.stringify({ 
        status: "success", 
        message: "Payment processed successfully.",
        fulfillment: fulfillResult
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    log('ERROR', 'Webhook error', { error: error?.message, stack: error?.stack });
    return new Response(
      JSON.stringify({ status: "error", message: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
