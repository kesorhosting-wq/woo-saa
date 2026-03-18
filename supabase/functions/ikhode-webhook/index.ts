import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, Authorization",
};

function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, data?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    function: 'ikhode-webhook',
    message,
    ...data,
  };
  if (level === 'ERROR') console.error(JSON.stringify(entry));
  else if (level === 'WARN') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Telegram notification
async function sendTelegramNotification(message: string, isError: boolean = false) {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!botToken || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${isError ? '❌' : '✅'} ${message}`,
        parse_mode: 'HTML'
      })
    });
  } catch (error) {
    log('ERROR', 'Failed to send Telegram notification', { error: String(error) });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const orderIdFromPath = pathParts[pathParts.length - 1];

    log('INFO', 'Webhook received', { orderIdFromPath, method: req.method });

    // Get webhook secret
    const { data: gateway } = await supabase
      .from("payment_gateways")
      .select("config")
      .eq("slug", "ikhode-bakong")
      .maybeSingle();

    const expectedSecret = (gateway?.config as any)?.webhook_secret || "";

    // Auth check
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") || "";

    if (expectedSecret && token !== expectedSecret) {
      log('ERROR', 'Unauthorized: Invalid secret key');
      return new Response(
        JSON.stringify({ status: "error", message: "Unauthorized: Invalid secret key." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse payload
    let payload: any = {};
    try {
      payload = await req.json();
      log('DEBUG', 'Webhook payload', { payload });
    } catch (e) {
      log('WARN', 'No JSON payload in request body');
    }

    // ========== WALLET TOP-UP ==========
    if (orderIdFromPath?.startsWith("wallet-")) {
      log('INFO', 'Processing wallet top-up', { orderIdFromPath });
      
      const parts = orderIdFromPath.split("-");
      if (parts.length < 3) {
        return new Response(
          JSON.stringify({ status: "error", message: "Invalid wallet order ID format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const userIdPrefix = parts[1];
      const amount = parseFloat(payload.amount) || 0;
      const transactionId = payload.transaction_id || payload.transactionId || orderIdFromPath;
      
      if (amount <= 0) {
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
    
    // ========== REGULAR ORDER ==========
    const transactionId = payload.transaction_id || payload.transactionId || orderIdFromPath;
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
        JSON.stringify({ status: "error", message: "Order not found." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log('INFO', 'Found Order', { orderId: order.id, status: order.status, g2bulk_product_id: order.g2bulk_product_id });

    // ATOMIC UPDATE to "paid" — the DB trigger will auto-fire process-topup
    const { data: lockResult } = await supabase
      .from("topup_orders")
      .update({
        status: "paid",
        payment_method: "Xavier KHQR",
        status_message: `Payment confirmed. Transaction: ${transactionId}. Auto-fulfillment queued via trigger.`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .in("status", ["pending", "paid", "notpaid"])
      .select("id");

    if (!lockResult || lockResult.length === 0) {
      log('INFO', 'Order already processed', { orderId: order.id, status: order.status });
      return new Response(
        JSON.stringify({ status: "success", message: "Order already being processed." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log('INFO', 'Order updated to paid — trigger will handle fulfillment', { orderId: order.id });

    // Send Telegram notification for payment received
    await sendTelegramNotification(
      `<b>💰 Payment Received</b>\n` +
      `🎮 Game: ${order.game_name}\n` +
      `📦 Package: ${order.package_name}\n` +
      `👤 Player: ${order.player_id}${order.server_id ? ` (Server: ${order.server_id})` : ''}\n` +
      `💵 Amount: $${order.amount}\n` +
      `🔢 Order ID: ${order.id}\n` +
      `💳 Transaction: ${transactionId}\n` +
      `⏳ Auto-fulfillment via trigger...`
    );

    return new Response(
      JSON.stringify({ 
        status: "success", 
        message: "Payment confirmed. Fulfillment triggered automatically.",
        orderId: order.id
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
