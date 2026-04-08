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

// ============ CONFIGURATION ============
// This will be replaced by your real project URL if needed
// or we can use the local kesorapi function invoke
const KESOR_API_URL = 'kesorapi'; 

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

// ============ ATOMIC LOCK ============
async function acquireFulfillmentLock(supabase: any, orderId: string, tableName: string): Promise<any | null> {
  const { data: lockResult } = await supabase
    .from(tableName)
    .update({ status: 'processing', status_message: 'Acquiring KesorAPI fulfillment lock...' })
    .eq('id', orderId)
    .in('status', ['paid', 'pending', 'notpaid'])
    .select('*');

  if (!lockResult || lockResult.length === 0) {
    log('WARN', 'Could not acquire lock - already processing', { orderId, tableName });
    return null;
  }
  return lockResult[0];
}

// Fulfill using KesorAPI (Direct SMM style)
async function fulfillWithKesorAPI(supabase: any, orderId: string, order: any, tableName: string) {
  try {
    const { data, error } = await supabase.functions.invoke('kesorapi', {
      body: {
        action: 'add',
        service: order.kesorapi_product_id, // We use this column for Kesor service ID
        link: order.server_id ? `${order.player_id}|${order.server_id}` : order.player_id,
        quantity: 1
      }
    });

    if (error || data?.error) {
      const errorMsg = error?.message || data?.error || 'KesorAPI transmission failed';
      return { success: false, error: errorMsg };
    }

    return { success: true, kesor_order_id: data.order, status: 'processing' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============ MAIN FULFILLMENT ============
async function fulfillOrder(supabase: any, orderId: string, options: { isPreorder?: boolean } = {}) {
  const tableName = options.isPreorder ? 'preorder_orders' : 'topup_orders';
  log('INFO', `Starting KesorAPI fulfillment`, { orderId, tableName });

  const order = await acquireFulfillmentLock(supabase, orderId, tableName);
  if (!order) return { success: false, error: 'Already processing' };

  if (!order.kesorapi_product_id) {
    await supabase.from(tableName).update({
      status: 'pending_manual',
      status_message: 'No KesorAPI node linked. Manual fulfillment required.'
    }).eq('id', orderId);
    return { success: true, status: 'pending_manual' };
  }

  // Check if KesorAPI is enabled
  const { data: apiConfig } = await supabase
    .from('api_configurations').select('*').eq('api_name', 'kesorapi').maybeSingle();
  
  if (!apiConfig?.is_enabled) {
    await supabase.from(tableName).update({
      status: 'pending_manual',
      status_message: 'KesorAPI Gateway disabled.'
    }).eq('id', orderId);
    return { success: true, status: 'pending_manual' };
  }

  const result = await fulfillWithKesorAPI(supabase, orderId, order, tableName);

  if (result.success) {
    await supabase.from(tableName).update({
      status: 'processing',
      kesorapi_order_id: String(result.kesor_order_id),
      status_message: `KesorAPI order created: ${result.kesor_order_id}`
    }).eq('id', orderId);

    await sendTelegramNotification(
      `<b>KesorAPI Transmission Active</b>\n` +
      `🎮 Game: ${order.game_name}\n📦 Package: ${order.package_name}\n` +
      `👤 Player: ${order.player_id}\n💰 Amount: $${order.amount}\n` +
      `📋 ID: ${result.kesor_order_id}`
    );
    return { success: true, kesor_order_id: result.kesor_order_id, status: 'processing' };
  } else {
    await supabase.from(tableName).update({
      status: 'failed',
      status_message: `KesorAPI Error: ${result.error}`
    }).eq('id', orderId);

    await sendTelegramNotification(`<b>Order Failed (KesorAPI)</b>\n⚠️ Error: ${result.error}`, true);
    await autoRefundWallet(supabase, order, tableName);
    return { success: false, error: result.error };
  }
}

async function checkKesorAPIStatus(supabase: any, orderId: string) {
  const { data: order } = await supabase.from('topup_orders').select('*').eq('id', orderId).single();
  if (!order?.kesorapi_order_id) return { success: false, error: 'No order ID' };

  const { data, error } = await supabase.functions.invoke('kesorapi', {
    body: {
      action: 'status',
      order: order.kesorapi_order_id
    }
  });

  if (error || !data) return { success: false, error: 'Status check failed' };

  const status = data.status?.toLowerCase();
  let finalStatus = 'processing';
  if (status === 'completed' || status === 'success') finalStatus = 'completed';
  if (status === 'failed' || status === 'canceled') finalStatus = 'failed';

  if (finalStatus !== 'processing') {
    await supabase.from('topup_orders').update({ 
      status: finalStatus, 
      status_message: `KesorAPI Final Status: ${data.status}` 
    }).eq('id', orderId);
    
    if (finalStatus === 'completed') {
       await sendTelegramNotification(`<b>Order Completed</b>\n🎮 ${order.game_name}\n👤 ${order.player_id}`);
    }
  }

  return { success: true, status: finalStatus };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const body = await req.json();

    if (body.action === 'fulfill' && body.orderId) {
      return new Response(JSON.stringify(await fulfillOrder(supabase, body.orderId)), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (body.action === 'check_status' && body.orderId) {
      return new Response(JSON.stringify(await checkKesorAPIStatus(supabase, body.orderId)), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Cron preorders
    if (body.action === 'process_preorders') {
      const { data: dueOrders } = await supabase.from('preorder_orders').select('*').eq('status', 'paid').lte('scheduled_fulfill_at', new Date().toISOString()).limit(10);
      if (dueOrders) {
        for (const order of dueOrders) await fulfillOrder(supabase, order.id, { isPreorder: true });
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Standard Order Creation
    const { game_name, package_name, player_id, server_id, amount, payment_method, kesorapi_product_id, user_id } = body;
    const { data: order } = await supabase.from('topup_orders').insert({
      game_name, package_name, player_id, server_id, amount, payment_method,
      kesorapi_product_id, user_id, status: 'pending'
    }).select().single();

    return new Response(JSON.stringify({ success: true, order_id: order?.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
