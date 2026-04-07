import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Cloud, CheckCircle2, AlertCircle, Loader2, Image as ImageIcon, RefreshCw } from 'lucide-react';

interface MigrationResult {
  table: string;
  column: string;
  id: string;
  oldUrl: string;
  newUrl: string;
  status: 'success' | 'error';
  error?: string;
}

const IMAGE_SOURCES = [
  { table: 'games', columns: ['image', 'cover_image', 'default_package_icon'], idCol: 'id' },
  { table: 'packages', columns: ['icon'], idCol: 'id' },
  { table: 'special_packages', columns: ['icon'], idCol: 'id' },
  { table: 'preorder_packages', columns: ['icon'], idCol: 'id' },
  { table: 'payment_qr_settings', columns: ['qr_code_image'], idCol: 'id' },
  { table: 'payment_gateways', columns: ['icon'], idCol: 'id' },
] as const;

const STORAGE_BUCKET = 'site-assets';
const CDN_FOLDER = 'cdn-migrated';

function isAlreadyCDN(url: string): boolean {
  if (!url) return true;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return url.includes(supabaseUrl) || url.includes('supabase.co/storage');
}

async function downloadAndUpload(url: string, folder: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
  
  const blob = await response.blob();
  const ext = url.split('.').pop()?.split('?')[0]?.substring(0, 5) || 'png';
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, blob, { cacheControl: '31536000', upsert: false });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(fileName);

  return publicUrl;
}

const CDNMigrationTab: React.FC = () => {
  const [scanning, setScanning] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [scanResults, setScanResults] = useState<{ table: string; column: string; id: string; url: string }[]>([]);
  const [migrationResults, setMigrationResults] = useState<MigrationResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);

  const scanForExternalImages = async () => {
    setScanning(true);
    setScanResults([]);
    setMigrationResults([]);
    const found: typeof scanResults = [];

    try {
      for (const source of IMAGE_SOURCES) {
        const { data, error } = await (supabase.from(source.table as any) as any)
          .select(`${source.idCol}, ${source.columns.join(', ')}`);

        if (error) {
          console.error(`Error scanning ${source.table}:`, error);
          continue;
        }

        if (data) {
          for (const row of data) {
            for (const col of source.columns) {
              const url = row[col];
              if (url && typeof url === 'string' && !isAlreadyCDN(url)) {
                found.push({ table: source.table, column: col, id: row[source.idCol], url });
              }
            }
          }
        }
      }

      // Also scan site_settings for banner images
      const { data: settingsData } = await supabase.from('site_settings').select('*');
      if (settingsData) {
        for (const setting of settingsData) {
          const val = setting.value;
          if (typeof val === 'string' && val.startsWith('http') && !isAlreadyCDN(val)) {
            found.push({ table: 'site_settings', column: 'value', id: setting.id, url: val });
          }
          if (Array.isArray(val)) {
            for (const item of val) {
              if (typeof item === 'string' && item.startsWith('http') && !isAlreadyCDN(item)) {
                found.push({ table: 'site_settings', column: 'value', id: setting.id, url: item });
              }
            }
          }
        }
      }

      setScanResults(found);
      toast({
        title: `Scan complete`,
        description: found.length > 0 
          ? `Found ${found.length} external image(s) to migrate` 
          : 'All images are already on CDN! ✅'
      });
    } catch (err) {
      console.error('Scan error:', err);
      toast({ title: 'Scan failed', variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  };

  const migrateAll = async () => {
    if (scanResults.length === 0) return;
    setMigrating(true);
    setTotal(scanResults.length);
    setProgress(0);
    const results: MigrationResult[] = [];

    for (let i = 0; i < scanResults.length; i++) {
      const item = scanResults[i];
      try {
        const newUrl = await downloadAndUpload(item.url, `${CDN_FOLDER}/${item.table}`);

        // Update the database record
        if (item.table === 'site_settings') {
          // For site_settings, we need to handle JSON values
          const { data: setting } = await supabase.from('site_settings')
            .select('*').eq('id', item.id).single();
          
          if (setting) {
            let newValue = setting.value;
            if (typeof newValue === 'string' && newValue === item.url) {
              newValue = newUrl;
            } else if (Array.isArray(newValue)) {
              newValue = (newValue as string[]).map((v: string) => v === item.url ? newUrl : v);
            }
            await supabase.from('site_settings').update({ value: newValue as any }).eq('id', item.id);
          }
        } else {
          await (supabase.from(item.table as any) as any)
            .update({ [item.column]: newUrl })
            .eq('id', item.id);
        }

        results.push({ table: item.table, column: item.column, id: item.id, oldUrl: item.url, newUrl, status: 'success' });
      } catch (err: any) {
        results.push({ table: item.table, column: item.column, id: item.id, oldUrl: item.url, newUrl: '', status: 'error', error: err.message });
      }
      setProgress(i + 1);
      setMigrationResults([...results]);
    }

    const successCount = results.filter(r => r.status === 'success').length;
    toast({
      title: 'Migration complete',
      description: `${successCount}/${results.length} images migrated to CDN`
    });
    setMigrating(false);
  };

  const successCount = migrationResults.filter(r => r.status === 'success').length;
  const errorCount = migrationResults.filter(r => r.status === 'error').length;

  return (
    <Card className="border-gold/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="w-5 h-5 text-gold" />
          CDN Image Migration
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Migrate all external images to Cloud Storage for faster loading. Images already on storage are skipped.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Actions */}
        <div className="flex gap-3">
          <Button onClick={scanForExternalImages} disabled={scanning || migrating} variant="outline">
            {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Scan for External Images
          </Button>
          {scanResults.length > 0 && (
            <Button onClick={migrateAll} disabled={migrating} className="bg-gold hover:bg-gold/90 text-primary-foreground">
              {migrating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
              Migrate {scanResults.length} Image{scanResults.length > 1 ? 's' : ''} to CDN
            </Button>
          )}
        </div>

        {/* Progress */}
        {migrating && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Migrating...</span>
              <span>{progress}/{total}</span>
            </div>
            <Progress value={(progress / total) * 100} className="h-2" />
          </div>
        )}

        {/* Scan Results */}
        {scanResults.length > 0 && migrationResults.length === 0 && !migrating && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Found {scanResults.length} external image(s):</h3>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {scanResults.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs p-2 bg-secondary/50 rounded">
                  <ImageIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                  <Badge variant="outline" className="text-[10px]">{item.table}.{item.column}</Badge>
                  <span className="truncate text-muted-foreground">{item.url}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Migration Results */}
        {migrationResults.length > 0 && (
          <div className="space-y-2">
            <div className="flex gap-3 text-sm">
              {successCount > 0 && (
                <span className="flex items-center gap-1 text-emerald-500">
                  <CheckCircle2 className="w-4 h-4" /> {successCount} migrated
                </span>
              )}
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="w-4 h-4" /> {errorCount} failed
                </span>
              )}
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {migrationResults.map((r, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs p-2 rounded ${r.status === 'success' ? 'bg-emerald-500/10' : 'bg-destructive/10'}`}>
                  {r.status === 'success' ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" /> : <AlertCircle className="w-3 h-3 text-destructive shrink-0" />}
                  <Badge variant="outline" className="text-[10px]">{r.table}.{r.column}</Badge>
                  {r.status === 'error' && <span className="text-destructive">{r.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info */}
        {scanResults.length === 0 && migrationResults.length === 0 && !scanning && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <Cloud className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Click "Scan" to find external images that can be migrated to Cloud Storage CDN.</p>
            <p className="text-xs mt-1">This improves loading speed by serving images from the nearest edge location.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CDNMigrationTab;
