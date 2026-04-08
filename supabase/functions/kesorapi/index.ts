import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This points to your MAIN site where we just built the Reseller API
const KESOR_MASTER_URL = 'https://bpgsdarpsyvkdxkprbvs.supabase.co/functions/v1/reseller-api/api/v2';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    
    // Get API Key from database config
    const { data: config } = await supabase.from('api_configurations').select('api_secret').eq('api_name', 'kesorapi').maybeSingle();
    
    if (!config?.api_secret) {
      return new Response(JSON.stringify({ error: 'KesorAPI key not set in admin' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    
    // Inject the real API key into the SMM-style request body
    const payload = {
      ...body,
      key: config.api_secret
    };

    // Forward to Master KesorAPI
    const response = await fetch(KESOR_MASTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
