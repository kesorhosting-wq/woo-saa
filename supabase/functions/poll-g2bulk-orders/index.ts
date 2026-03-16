import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const G2BULK_API_URL = 'https://api.g2bulk.com/v1';

function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, data?: Record<string, unknown>) {
  const entry = { timestamp: new Date().toISOString(), level, function: 'poll-g2bulk-orders', message, ...data };
  if (level === 'ERROR') console.error(JSON.stringify(entry));
  else if (level === 'WARN') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

// Extract game_code from g2bulk_product_id OR from g2bulk_products table
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
    if (parts.length >= 3) {
      // e.g. game_mlbb_2800 -> mlbb, game_mlbb_exclusive_712 -> mlbb_exclusive
      return parts.slice(1, -1).join('_');
    }
  }

  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  log('INFO', 'Starting order status poll...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get G2Bulk credentials
    const { data: apiConfig, error: configError } = await supabase
      .from('api_configurations')
      .select('*')
      .eq('api_name', 'g2bulk')
      .single();

    if (configError || !apiConfig?.is_enabled || !apiConfig.api_secret) {
      log('INFO', 'G2Bulk not configured or disabled');
      return new Response(
        JSON.stringify({ success: true, message: 'G2Bulk not configured', checked: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = apiConfig.api_secret;

    // Get orders that are processing and have a G2Bulk order ID
    const { data: pendingOrders, error: ordersError } = await supabase
      .from('topup_orders')
      .select('*')
      .in('status', ['processing'])
      .not('g2bulk_order_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(50);

    if (ordersError) {
      log('ERROR', 'Error fetching orders', { error: ordersError.message });
      throw ordersError;
    }

    if (!pendingOrders || pendingOrders.length === 0) {
      log('INFO', 'No pending orders to check');
      return new Response(
        JSON.stringify({ success: true, message: 'No pending orders', checked: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    log('INFO', `Found ${pendingOrders.length} orders to check`);

    let updated = 0;
    let completed = 0;
    let failed = 0;

    for (const order of pendingOrders) {
      try {
        if (!order.g2bulk_product_id) {
          log('WARN', `Order ${order.id} has no g2bulk_product_id, skipping`);
          continue;
        }

        const gameCode = await resolveGameCode(supabase, order.g2bulk_product_id);
        if (!gameCode) {
          log('WARN', `Cannot determine game code for order ${order.id}, product: ${order.g2bulk_product_id}`);
          continue;
        }

        // Handle comma-separated order IDs (from multi-quantity fulfillments)
        const orderIds = String(order.g2bulk_order_id).split(',').map((id: string) => id.trim()).filter(Boolean);
        let worstStatus = 'COMPLETED'; // assume best, downgrade if any fail

        for (const g2OrderId of orderIds) {
          const parsedId = parseInt(g2OrderId);
          if (isNaN(parsedId)) continue;

          const response = await fetch(`${G2BULK_API_URL}/games/order/status`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'X-API-Key': apiKey,
            },
            body: JSON.stringify({ order_id: parsedId, game: gameCode })
          });

          if (!response.ok) {
            log('WARN', `G2Bulk API returned ${response.status} for order ${g2OrderId}`);
            worstStatus = 'PROCESSING'; // don't mark failed just because API is down
            continue;
          }

          const result = await response.json();
          if (result.success && result.order) {
            const s = result.order.status;
            if (s === 'FAILED') { worstStatus = 'FAILED'; break; }
            if (s === 'PROCESSING' || s === 'PENDING') worstStatus = 'PROCESSING';
          } else {
            log('WARN', `G2Bulk API error for sub-order ${g2OrderId}:`, { message: result.message || result.detail });
          }

          await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Map aggregated status
        let newStatus = order.status;
        let statusMessage = '';
        switch (worstStatus) {
          case 'COMPLETED':
            newStatus = 'completed';
            statusMessage = 'G2Bulk order completed successfully';
            completed++;
            break;
          case 'FAILED':
            newStatus = 'failed';
            statusMessage = 'G2Bulk order failed';
            failed++;
            break;
          case 'PROCESSING':
          case 'PENDING':
            // Keep as processing
            break;
        }

        if (newStatus !== order.status) {
          await supabase
            .from('topup_orders')
            .update({ status: newStatus, status_message: statusMessage })
            .eq('id', order.id);
          updated++;
          log('INFO', `Order ${order.id} updated: ${order.status} -> ${newStatus}`);
        }
      } catch (err) {
        log('ERROR', `Error checking order ${order.id}`, { error: String(err) });
      }
    }

    const duration = Date.now() - startTime;
    log('INFO', `Completed in ${duration}ms`, { checked: pendingOrders.length, updated, completed, failed });

    return new Response(
      JSON.stringify({ success: true, checked: pendingOrders.length, updated, completed, failed, duration: `${duration}ms` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('ERROR', 'Fatal error', { error: errorMessage });
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
