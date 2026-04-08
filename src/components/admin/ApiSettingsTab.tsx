import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Key, Eye, EyeOff, Save, RefreshCw, Check, X, Wallet, Download, Package, Cpu, CheckCircle2, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ApiConfig {
  id?: string;
  api_name: string;
  api_uid: string;
  api_secret: string;
  is_enabled: boolean;
  use_sandbox: boolean;
}

interface SyncStats {
  synced: number;
  categories: number;
}

const ApiSettingsTab: React.FC = () => {
  const [kesorConfig, setKesorConfig] = useState<ApiConfig>({
    api_name: 'kesorapi',
    api_uid: '',
    api_secret: '',
    is_enabled: false,
    use_sandbox: false,
  });
  const [showSecret, setShowSecret] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; balance?: string; message?: string } | null>(null);
  const [syncStats, setSyncStats] = useState<SyncStats | null>(null);
  const [productCount, setProductCount] = useState(0);

  useEffect(() => {
    loadApiConfig();
    loadProductCount();
  }, []);

  const loadApiConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('api_configurations')
        .select('*')
        .eq('api_name', 'kesorapi')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setKesorConfig({
          id: data.id,
          api_name: data.api_name,
          api_uid: data.api_uid || '',
          api_secret: data.api_secret || '',
          is_enabled: data.is_enabled || false,
          use_sandbox: false,
        });
      }
    } catch (error) {
      console.error('Error loading API config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadProductCount = async () => {
    try {
      const { count } = await supabase
        .from('kesorapi_products')
        .select('*', { count: 'exact', head: true });
      setProductCount(count || 0);
    } catch (error) {
      console.error('Error loading product count:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        api_name: 'kesorapi',
        api_uid: kesorConfig.api_uid,
        api_secret: kesorConfig.api_secret,
        is_enabled: kesorConfig.is_enabled,
        use_sandbox: false,
      };

      const { error } = await supabase
        .from('api_configurations')
        .upsert(payload, { onConflict: 'api_name' });

      if (error) throw error;

      toast({ title: 'KesorAPI configuration saved!' });
      setTestResult(null);
    } catch (error) {
      console.error('Error saving API config:', error);
      toast({ title: 'Failed to save configuration', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      // Calling kesorapi function
      const { data, error } = await supabase.functions.invoke('kesorapi', {
        body: { action: 'balance' },
      });

      if (error) throw error;

      if (data?.balance !== undefined) {
        setTestResult({ 
          success: true, 
          balance: String(data.balance),
          message: `Connected to KesorAPI Node!` 
        });
        toast({ title: 'API connection successful!' });
      } else {
        setTestResult({ success: false, message: data?.error || 'Connection failed' });
        toast({ title: 'Connection failed', description: data?.error, variant: 'destructive' });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Connection test failed';
      setTestResult({ success: false, message: errorMessage });
      toast({ title: 'Connection test failed', variant: 'destructive' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncProducts = async () => {
    setIsSyncing(true);
    setSyncStats(null);
    try {
      toast({ title: 'Syncing products from KesorAPI...', description: 'Establishing catalog link.' });
      
      const { data, error } = await supabase.functions.invoke('kesorapi', {
        body: { action: 'services' },
      });

      if (error) throw error;

      if (Array.isArray(data)) {
        // Logic to sync into local kesorapi_products (we keep table name for compatibility)
        const products = data.map((p: any) => ({
          kesorapi_product_id: String(p.service),
          kesorapi_type_id: 'Package',
          product_name: p.name,
          game_name: p.category,
          price: parseFloat(p.rate),
          is_active: true
        }));

        // Batch upsert into kesorapi_products
        const { error: upsertError } = await supabase
          .from('kesorapi_products')
          .upsert(products, { onConflict: 'kesorapi_product_id' });

        if (upsertError) throw upsertError;

        setProductCount(products.length);
        setSyncStats({ synced: products.length, categories: new Set(products.map(p => p.game_name)).size });
        
        toast({ 
          title: 'KesorAPI Sync Success!', 
          description: `${products.length} items imported.` 
        });
      } else {
        toast({ title: 'Sync failed', description: 'Invalid data format from API', variant: 'destructive' });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      toast({ title: 'Sync failed', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="border-pink-500/30">
        <CardContent className="p-8 text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#FF2D85]" />
          <p className="mt-4 text-muted-foreground">Loading KesorAPI parameters...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KesorAPI Configuration */}
      <Card className="border-pink-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#FF2D85]" />
            KesorAPI Protocol Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-secondary/50 p-4 rounded-lg border border-border">
            <h4 className="font-semibold mb-2">About KesorAPI Integrated Node</h4>
            <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest text-[10px]">
              Direct transmission protocol for automated game loads and voucher delivery.
            </p>
          </div>

          <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border">
            <div>
              <h4 className="font-semibold uppercase text-xs">Enable KesorAPI Gateway</h4>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight">Active direct injection protocol</p>
            </div>
            <Switch
              checked={kesorConfig.is_enabled}
              onCheckedChange={(checked) => setKesorConfig({ ...kesorConfig, is_enabled: checked })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">X-API-KEY</label>
            <div className="relative">
              <Input
                type={showSecret ? 'text' : 'password'}
                placeholder="sk_live_..."
                value={kesorConfig.api_secret}
                onChange={(e) => setKesorConfig({ ...kesorConfig, api_secret: e.target.value })}
                className="border-pink-500/20 pr-10 font-bold"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {testResult && (
            <div className={`p-4 rounded-xl border ${testResult.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              <div className="flex items-center gap-2">
                {testResult.success ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <ShieldAlert className="w-5 h-5 text-red-500" />}
                <span className={cn("font-black uppercase text-[10px] tracking-widest", testResult.success ? 'text-green-500' : 'text-red-500')}>{testResult.message}</span>
              </div>
              {testResult.success && testResult.balance && (
                <div className="mt-2 flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
                  <Wallet className="w-4 h-4" />
                  <span>Available Credit: ${testResult.balance}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSave} disabled={isSaving} className="bg-black hover:bg-slate-800 text-white font-black uppercase tracking-widest text-[10px] px-8">
              {isSaving ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Syncing...</> : <><Save className="w-4 h-4 mr-2" />Save Config</>}
            </Button>

            <Button variant="outline" onClick={handleTestConnection} disabled={isTesting || !kesorConfig.api_secret} className="font-black uppercase tracking-widest text-[10px] px-8">
              {isTesting ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Verifying...</> : <><RefreshCw className="w-4 h-4 mr-2" />Test Node</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Product Sync */}
      <Card className="border-pink-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 uppercase tracking-tight text-lg font-black">
            <Package className="w-5 h-5 text-[#FF2D85]" />
            Node Catalog
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-6 bg-secondary/50 rounded-2xl border border-border">
            <div>
              <h4 className="font-black uppercase text-sm">Indexed Products</h4>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{productCount} nodes currently mapped</p>
            </div>
            <Button 
              onClick={handleSyncProducts} 
              disabled={isSyncing || !kesorConfig.is_enabled}
              className="bg-[#FF2D85] text-white hover:bg-[#D81B60] font-black uppercase tracking-widest text-[10px] h-12 px-8"
            >
              {isSyncing ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Scanning...</>
              ) : (
                <><Download className="w-4 h-4 mr-2" />Fetch Catalog</>
              )}
            </Button>
          </div>

          <p className="text-[9px] text-muted-foreground font-bold uppercase leading-relaxed text-center px-4">
            Fetching the catalog will synchronize all available game denominations from the KesorAPI node.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ApiSettingsTab;
