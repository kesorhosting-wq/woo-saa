import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Structured logging helper
function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, data?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    function: 'g2bulk-webhook',
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

// Telegram notification function
async function sendTelegramNotification(message: string, isError: boolean = false) {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  
  if (!botToken || !chatId) {
    console.log('[Telegram] Bot token or chat ID not configured, skipping notification');
    return;
  }

  const emoji = isError ? '❌' : '✅';
  const formattedMessage = `${emoji} ${message}`;

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: formattedMessage,
        parse_mode: 'HTML'
      })
    });

    const result = await response.json();
    if (!result.ok) {
      console.error('[Telegram] Failed to send notification:', result.description);
    } else {
      console.log('[Telegram] Notification sent successfully');
    }
  } catch (error) {
    console.error('[Telegram] Error sending notification:', error);
  }
}

// Auto refund wallet if order was paid via wallet
async function autoRefundWallet(supabase: any, order: any) {
  if (order.payment_method !== 'Wallet' || !order.user_id) {
    return;
  }

  try {
    console.log(`[G2Bulk-Webhook] Processing auto wallet refund for order ${order.id}`);

    const { data: profile } = await supabase
      .from('profiles')
      .select('wallet_balance')
      .eq('user_id', order.user_id)
      .single();

    if (!profile) return;

    const currentBalance = profile.wallet_balance || 0;
    const refundAmount = Math.abs(order.amount);
    const newBalance = currentBalance + refundAmount;

    await supabase
      .from('wallet_transactions')
      .insert({
        user_id: order.user_id,
        type: 'refund',
        amount: refundAmount,
        balance_before: currentBalance,
        balance_after: newBalance,
        description: `Auto refund for failed order: ${order.game_name} - ${order.package_name}`,
        reference_id: `refund-${order.id}`
      });

    console.log(`[G2Bulk-Webhook] Wallet refund successful: $${refundAmount} to user ${order.user_id}`);

    await sendTelegramNotification(
      `<b>💰 Auto Wallet Refund (Webhook)</b>\n` +
      `🎮 Game: ${order.game_name}\n` +
      `📦 Package: ${order.package_name}\n` +
      `💵 Refund: $${refundAmount.toFixed(2)}\n` +
      `💰 New Balance: $${newBalance.toFixed(2)}\n` +
      `🔢 Order ID: ${order.id}`
    );
  } catch (error: any) {
    console.error(`[G2Bulk-Webhook] Auto refund error:`, error);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Security: Validate webhook authentication
    // Check for G2Bulk signature or shared secret in Authorization header
    const authHeader = req.headers.get('Authorization') || req.headers.get('X-G2Bulk-Signature');
    const webhookSecret = Deno.env.get('G2BULK_WEBHOOK_SECRET');
    
    // If webhook secret is configured, validate it
    if (webhookSecret) {
      const providedSecret = authHeader?.replace('Bearer ', '').trim();
      if (!providedSecret || providedSecret !== webhookSecret) {
        console.error('[G2Bulk-Webhook] Unauthorized: Invalid or missing webhook secret');
        return new Response('Unauthorized', { status: 401 });
      }
      console.log('[G2Bulk-Webhook] Webhook authentication successful');
    } else {
      // Log warning if no secret configured - still allow for backwards compatibility
      // but log the source IP for security monitoring
      const sourceIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
      console.warn(`[G2Bulk-Webhook] No webhook secret configured. Request from IP: ${sourceIp}. Consider adding G2BULK_WEBHOOK_SECRET for security.`);
    }

    // Parse the callback payload from G2Bulk
    const payload = await req.json();
    
    console.log('[G2Bulk-Webhook] Received callback:', JSON.stringify(payload));

    // G2Bulk callback payload structure:
    // {
    //   "order_id": 42,
    //   "game_code": "pubgm",
    //   "game_name": "PUBG Mobile",
    //   "player_id": "5679523421",
    //   "player_name": "PlayerName",
    //   "server_id": "2001",
    //   "denom_id": "60 UC",
    //   "price": 0.88,
    //   "status": "COMPLETED",
    //   "message": "Order completed successfully",
    //   "remark": "order_id:uuid-here",
    //   "timestamp": "2024-01-15T10:30:00Z"
    // }

    const g2bulkOrderId = String(payload.order_id || '');
    const status = String(payload.status || '');
    const message = String(payload.message || '');
    const remark = String(payload.remark || '');
    const deliveryItems = payload.delivery_items || [];

    console.log('[G2Bulk-Webhook] Order details:', {
      g2bulkOrderId,
      status,
      message,
      remark
    });

    // Extract our internal order ID from remark if present
    let internalOrderId = '';
    if (remark.startsWith('order_id:')) {
      internalOrderId = remark.replace('order_id:', '');
    }

    // Find the order in our database
    let orderQuery = supabase.from('topup_orders').select('*');
    
    if (internalOrderId) {
      orderQuery = orderQuery.eq('id', internalOrderId);
    } else if (g2bulkOrderId) {
      orderQuery = orderQuery.eq('g2bulk_order_id', g2bulkOrderId);
    } else {
      console.error('[G2Bulk-Webhook] No order ID in callback');
      return new Response('OK', { status: 200 });
    }

    const { data: order, error: orderError } = await orderQuery.maybeSingle();

    if (orderError || !order) {
      console.error('[G2Bulk-Webhook] Order not found:', orderError);
      return new Response('OK', { status: 200 });
    }

    // Map G2Bulk status to our status
    // G2Bulk statuses: PENDING, PROCESSING, COMPLETED, FAILED
    let newStatus = order.status;
    let statusMessage = message;
    let cardCodesJson: unknown = null;

    switch (status.toUpperCase()) {
      case 'COMPLETED':
        newStatus = 'completed';
        statusMessage = `G2Bulk order completed. Order: ${g2bulkOrderId}`;
        
        // Handle delivery items (for card/voucher orders)
        if (deliveryItems && Array.isArray(deliveryItems) && deliveryItems.length > 0) {
          cardCodesJson = deliveryItems.map((item: string) => ({
            code: item,
            serial: '',
            expire: ''
          }));
          statusMessage += `. ${deliveryItems.length} code(s) delivered.`;
        }
        break;
        
      case 'FAILED':
        newStatus = 'failed';
        statusMessage = `G2Bulk order failed. Order: ${g2bulkOrderId}. ${message}`;
        break;
        
      case 'PROCESSING':
        newStatus = 'processing';
        statusMessage = `G2Bulk processing order. Order: ${g2bulkOrderId}`;
        break;
        
      case 'PENDING':
        newStatus = 'processing';
        statusMessage = `G2Bulk order pending. Order: ${g2bulkOrderId}`;
        break;
    }

    // Update order status
    const updateData: Record<string, unknown> = {
      status: newStatus,
      status_message: statusMessage,
      g2bulk_order_id: g2bulkOrderId || order.g2bulk_order_id
    };

    if (cardCodesJson) {
      updateData.card_codes = cardCodesJson;
    }

    const { error: updateError } = await supabase
      .from('topup_orders')
      .update(updateData)
      .eq('id', order.id);

    if (updateError) {
      console.error('[G2Bulk-Webhook] Failed to update order:', updateError);
    } else {
      console.log(`[G2Bulk-Webhook] Order ${order.id} updated to status: ${newStatus}`);

      // Send Telegram notification for completed or failed orders
      if (newStatus === 'completed') {
        const codesInfo = cardCodesJson && Array.isArray(cardCodesJson) 
          ? `\n🎫 Codes: ${(cardCodesJson as Array<unknown>).length} delivered` 
          : '';
        
        await sendTelegramNotification(
          `<b>Order Completed (Webhook)</b>\n` +
          `🎮 Game: ${order.game_name}\n` +
          `📦 Package: ${order.package_name}\n` +
          `👤 Player: ${order.player_id}${order.server_id ? ` (Server: ${order.server_id})` : ''}\n` +
          `💰 Amount: $${order.amount}\n` +
          `🔢 Order ID: ${order.id}\n` +
          `📋 G2Bulk Order: ${g2bulkOrderId}${codesInfo}`
        );
      } else if (newStatus === 'failed') {
        await sendTelegramNotification(
          `<b>Order Failed (Webhook)</b>\n` +
          `🎮 Game: ${order.game_name}\n` +
          `📦 Package: ${order.package_name}\n` +
          `👤 Player: ${order.player_id}${order.server_id ? ` (Server: ${order.server_id})` : ''}\n` +
          `💰 Amount: $${order.amount}\n` +
          `🔢 Order ID: ${order.id}\n` +
          `📋 G2Bulk Order: ${g2bulkOrderId}\n` +
          `⚠️ Message: ${message}`,
          true
        );

        // Auto refund wallet for failed orders
        await autoRefundWallet(supabase, order);
      }
    }

    // G2Bulk expects a 2xx response to acknowledge the callback
    return new Response('OK', { 
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });

  } catch (error: unknown) {
    console.error('[G2Bulk-Webhook] Error:', error);
    // Still return OK to prevent retries
    return new Response('OK', { status: 200 });
  }
});
