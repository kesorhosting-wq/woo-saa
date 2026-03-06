import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { useSite } from '@/contexts/SiteContext';
import {
  Plus, Trash2, Edit2, Save, X, ChevronDown, ChevronUp,
  Package, Calendar, Clock, Loader2, RefreshCw, Play, AlertCircle
} from 'lucide-react';
import G2BulkProductSelector from './G2BulkProductSelector';

interface PreorderGame {
  id: string;
  game_id: string;
  is_active: boolean;
  sort_order: number;
  game_name?: string;
  game_image?: string;
}

interface PreorderPackage {
  id: string;
  game_id: string;
  name: string;
  amount: string;
  price: number;
  icon?: string;
  g2bulk_product_id?: string;
  g2bulk_type_id?: string;
  quantity?: number;
  scheduled_fulfill_at?: string;
  sort_order: number;
  label?: string;
  label_bg_color?: string;
  label_text_color?: string;
}

interface PreorderOrder {
  id: string;
  game_name: string;
  package_name: string;
  player_id: string;
  server_id?: string;
  player_name?: string;
  amount: number;
  status: string;
  status_message?: string;
  scheduled_fulfill_at?: string;
  g2bulk_order_id?: string;
  created_at: string;
  payment_method?: string;
}

const PreorderAdminTab: React.FC = () => {
  const { games } = useSite();
  const [preorderGames, setPreorderGames] = useState<PreorderGame[]>([]);
  const [packages, setPackages] = useState<Record<string, PreorderPackage[]>>({});
  const [orders, setOrders] = useState<PreorderOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [selectedGameToAdd, setSelectedGameToAdd] = useState('');
  const [orderFilter, setOrderFilter] = useState('all');
  const [tab, setTab] = useState<'games' | 'orders'>('games');

  // New package form
  const [newPkg, setNewPkg] = useState({ name: '', amount: '', price: 0, g2bulkProductId: '', g2bulkTypeId: '', quantity: '', scheduledAt: '', icon: '' });
  const [editingPkg, setEditingPkg] = useState<string | null>(null);
  const [editPkgData, setEditPkgData] = useState<any>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [gamesRes, ordersRes] = await Promise.all([
        supabase.from('preorder_games').select('*').order('sort_order'),
        supabase.from('preorder_orders').select('*').order('created_at', { ascending: false }).limit(100)
      ]);

      const pgames = (gamesRes.data || []).map(pg => {
        const g = games.find(g => g.id === pg.game_id);
        return { ...pg, game_name: g?.name || 'Unknown', game_image: g?.image || '' };
      });
      setPreorderGames(pgames);
      setOrders(ordersRes.data || []);

      // Load packages for all preorder games
      if (pgames.length > 0) {
        const { data: allPkgs } = await supabase
          .from('preorder_packages')
          .select('*')
          .in('game_id', pgames.map(g => g.id))
          .order('sort_order');

        const pkgMap: Record<string, PreorderPackage[]> = {};
        (allPkgs || []).forEach(p => {
          if (!pkgMap[p.game_id]) pkgMap[p.game_id] = [];
          pkgMap[p.game_id].push(p);
        });
        setPackages(pkgMap);
      }
    } catch (err) {
      console.error('Failed to load preorder data:', err);
    } finally {
      setLoading(false);
    }
  }, [games]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddPreorderGame = async () => {
    if (!selectedGameToAdd) return;
    try {
      const { error } = await supabase.from('preorder_games').insert({ game_id: selectedGameToAdd });
      if (error) throw error;
      toast({ title: 'Pre-order game added!' });
      setSelectedGameToAdd('');
      loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    await supabase.from('preorder_games').update({ is_active: !isActive }).eq('id', id);
    loadData();
  };

  const handleDeletePreorderGame = async (id: string) => {
    if (!confirm('Delete this pre-order game and all its packages?')) return;
    await supabase.from('preorder_games').delete().eq('id', id);
    loadData();
    toast({ title: 'Deleted!' });
  };

  const handleAddPackage = async (preorderGameId: string) => {
    if (!newPkg.name || newPkg.price <= 0) {
      toast({ title: 'Fill name and price', variant: 'destructive' });
      return;
    }
    const insertData: any = {
      game_id: preorderGameId,
      name: newPkg.name,
      amount: newPkg.amount || newPkg.name,
      price: newPkg.price,
      icon: newPkg.icon || null,
      g2bulk_product_id: newPkg.g2bulkProductId || null,
      g2bulk_type_id: newPkg.g2bulkTypeId || null,
      quantity: newPkg.quantity ? parseInt(newPkg.quantity) : null,
      scheduled_fulfill_at: newPkg.scheduledAt ? new Date(newPkg.scheduledAt).toISOString() : null,
    };
    const { error } = await supabase.from('preorder_packages').insert(insertData);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setNewPkg({ name: '', amount: '', price: 0, g2bulkProductId: '', g2bulkTypeId: '', quantity: '', scheduledAt: '', icon: '' });
    loadData();
    toast({ title: 'Package added!' });
  };

  const handleSavePackage = async (pkgId: string) => {
    const updateData: any = {
      name: editPkgData.name,
      amount: editPkgData.amount,
      price: editPkgData.price,
      icon: editPkgData.icon || null,
      g2bulk_product_id: editPkgData.g2bulkProductId || null,
      g2bulk_type_id: editPkgData.g2bulkTypeId || null,
      quantity: editPkgData.quantity ? parseInt(editPkgData.quantity) : null,
      scheduled_fulfill_at: editPkgData.scheduledAt ? new Date(editPkgData.scheduledAt).toISOString() : null,
    };
    await supabase.from('preorder_packages').update(updateData).eq('id', pkgId);
    setEditingPkg(null);
    loadData();
    toast({ title: 'Package updated!' });
  };

  const handleDeletePackage = async (pkgId: string) => {
    if (!confirm('Delete this package?')) return;
    await supabase.from('preorder_packages').delete().eq('id', pkgId);
    loadData();
    toast({ title: 'Deleted!' });
  };

  const handleManualFulfill = async (orderId: string) => {
    if (!confirm('Manually fulfill this pre-order now?')) return;
    try {
      const { data, error } = await supabase.functions.invoke('process-topup', {
        body: { action: 'fulfill', orderId, isPreorder: true }
      });
      if (error) throw error;
      toast({ title: data?.success ? 'Fulfilled!' : 'Failed', description: data?.error || data?.status_message });
      loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const filteredOrders = orderFilter === 'all' ? orders : orders.filter(o => o.status === orderFilter);
  const availableGames = games.filter(g => !preorderGames.some(pg => pg.game_id === g.id));

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-gold" /></div>;

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex gap-2">
        <Button variant={tab === 'games' ? 'default' : 'outline'} size="sm" onClick={() => setTab('games')}>
          <Package className="w-4 h-4 mr-1" /> Games & Packages
        </Button>
        <Button variant={tab === 'orders' ? 'default' : 'outline'} size="sm" onClick={() => setTab('orders')}>
          <Clock className="w-4 h-4 mr-1" /> Pre-Orders ({orders.length})
        </Button>
        <Button variant="ghost" size="sm" onClick={loadData}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      {tab === 'games' && (
        <>
          {/* Add preorder game */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Add Pre-Order Game</CardTitle></CardHeader>
            <CardContent className="flex gap-2">
              <select
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedGameToAdd}
                onChange={e => setSelectedGameToAdd(e.target.value)}
              >
                <option value="">Select a game...</option>
                {availableGames.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <Button onClick={handleAddPreorderGame} disabled={!selectedGameToAdd} size="sm">
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </CardContent>
          </Card>

          {/* Preorder games list */}
          {preorderGames.map(pg => (
            <Card key={pg.id} className="border-gold/30">
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedGame(expandedGame === pg.id ? null : pg.id)}>
                  {pg.game_image && <img src={pg.game_image} alt="" className="w-8 h-8 rounded object-cover" />}
                  <div>
                    <CardTitle className="text-sm">{pg.game_name}</CardTitle>
                    <span className="text-xs text-muted-foreground">{(packages[pg.id] || []).length} packages</span>
                  </div>
                  {expandedGame === pg.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleToggleActive(pg.id, pg.is_active)}>
                    <Badge variant={pg.is_active ? 'default' : 'secondary'}>{pg.is_active ? 'Active' : 'Inactive'}</Badge>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDeletePreorderGame(pg.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>

              {expandedGame === pg.id && (
                <CardContent className="space-y-4">
                  {/* Packages list */}
                  {(packages[pg.id] || []).map(pkg => (
                    <div key={pkg.id} className="p-3 rounded-lg bg-muted/50 space-y-2">
                      {editingPkg === pkg.id ? (
                        <div className="space-y-2">
                          <Input placeholder="Name" value={editPkgData.name} onChange={e => setEditPkgData({ ...editPkgData, name: e.target.value })} />
                          <div className="grid grid-cols-2 gap-2">
                            <Input placeholder="Amount" value={editPkgData.amount} onChange={e => setEditPkgData({ ...editPkgData, amount: e.target.value })} />
                            <Input type="number" placeholder="Price" value={editPkgData.price} onChange={e => setEditPkgData({ ...editPkgData, price: parseFloat(e.target.value) || 0 })} />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Input placeholder="Quantity" value={editPkgData.quantity} onChange={e => setEditPkgData({ ...editPkgData, quantity: e.target.value })} />
                            <Input type="datetime-local" value={editPkgData.scheduledAt} onChange={e => setEditPkgData({ ...editPkgData, scheduledAt: e.target.value })} />
                          </div>
                          <G2BulkProductSelector
                            value={editPkgData.g2bulkProductId}
                            onSelect={(productId, typeId) => setEditPkgData({ ...editPkgData, g2bulkProductId: productId, g2bulkTypeId: typeId })}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSavePackage(pkg.id)}><Save className="w-3 h-3 mr-1" />Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingPkg(null)}><X className="w-3 h-3" /></Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{pkg.name}</span>
                              <Badge variant="secondary">${pkg.price.toFixed(2)}</Badge>
                              {pkg.quantity && pkg.quantity > 1 && <Badge className="bg-blue-500 text-white">x{pkg.quantity}</Badge>}
                            </div>
                            {pkg.scheduled_fulfill_at && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                <Calendar className="w-3 h-3" />
                                Process on: {new Date(pkg.scheduled_fulfill_at).toLocaleString()}
                              </div>
                            )}
                            {pkg.g2bulk_product_id && <span className="text-xs text-muted-foreground">G2Bulk: {pkg.g2bulk_product_id}</span>}
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => {
                              setEditingPkg(pkg.id);
                              setEditPkgData({
                                name: pkg.name, amount: pkg.amount, price: pkg.price,
                                g2bulkProductId: pkg.g2bulk_product_id || '', g2bulkTypeId: pkg.g2bulk_type_id || '',
                                quantity: pkg.quantity ? String(pkg.quantity) : '',
                                scheduledAt: pkg.scheduled_fulfill_at ? new Date(pkg.scheduled_fulfill_at).toISOString().slice(0, 16) : '',
                                icon: pkg.icon || ''
                              });
                            }}><Edit2 className="w-3 h-3" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeletePackage(pkg.id)}>
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  <Separator />

                  {/* Add new package */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Add Package</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Name" value={newPkg.name} onChange={e => setNewPkg({ ...newPkg, name: e.target.value })} />
                      <Input placeholder="Amount" value={newPkg.amount} onChange={e => setNewPkg({ ...newPkg, amount: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="number" placeholder="Price" value={newPkg.price || ''} onChange={e => setNewPkg({ ...newPkg, price: parseFloat(e.target.value) || 0 })} />
                      <Input placeholder="Qty" value={newPkg.quantity} onChange={e => setNewPkg({ ...newPkg, quantity: e.target.value })} />
                      <Input type="datetime-local" value={newPkg.scheduledAt} onChange={e => setNewPkg({ ...newPkg, scheduledAt: e.target.value })} />
                    </div>
                    <G2BulkProductSelector
                      value={newPkg.g2bulkProductId}
                      onSelect={(productId, typeId) => setNewPkg({ ...newPkg, g2bulkProductId: productId, g2bulkTypeId: typeId })}
                    />
                    <Button size="sm" onClick={() => handleAddPackage(pg.id)}>
                      <Plus className="w-3 h-3 mr-1" /> Add Package
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}

          {preorderGames.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No pre-order games yet. Add one above.</p>
            </div>
          )}
        </>
      )}

      {tab === 'orders' && (
        <>
          {/* Order filters */}
          <div className="flex gap-2 flex-wrap">
            {['all', 'notpaid', 'paid', 'processing', 'completed', 'failed', 'partial'].map(f => (
              <Button key={f} variant={orderFilter === f ? 'default' : 'outline'} size="sm" onClick={() => setOrderFilter(f)}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== 'all' && ` (${orders.filter(o => o.status === f).length})`}
              </Button>
            ))}
          </div>

          {/* Orders list */}
          <div className="space-y-3">
            {filteredOrders.map(order => {
              const isDue = order.scheduled_fulfill_at && new Date(order.scheduled_fulfill_at) <= new Date();
              const canFulfill = order.status === 'paid' && isDue;

              return (
                <Card key={order.id} className={canFulfill ? 'border-green-500/50' : ''}>
                  <CardContent className="py-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{order.game_name}</span>
                          <Badge variant={
                            order.status === 'completed' ? 'default' :
                            order.status === 'failed' ? 'destructive' :
                            order.status === 'paid' ? 'secondary' : 'outline'
                          }>{order.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{order.package_name} • ${order.amount}</p>
                        <p className="text-xs text-muted-foreground">👤 {order.player_name} ({order.player_id})</p>
                        {order.scheduled_fulfill_at && (
                          <div className="flex items-center gap-1 text-xs">
                            <Calendar className="w-3 h-3" />
                            <span className={isDue ? 'text-green-500 font-medium' : 'text-muted-foreground'}>
                              {isDue ? '✓ Due' : 'Scheduled'}: {new Date(order.scheduled_fulfill_at).toLocaleString()}
                            </span>
                          </div>
                        )}
                        {order.status_message && <p className="text-xs text-muted-foreground">{order.status_message}</p>}
                        <p className="text-xs text-muted-foreground">Created: {new Date(order.created_at).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-1">
                        {canFulfill && (
                          <Button size="sm" variant="default" onClick={() => handleManualFulfill(order.id)}>
                            <Play className="w-3 h-3 mr-1" /> Fulfill
                          </Button>
                        )}
                        {order.status === 'paid' && !isDue && (
                          <div className="flex items-center gap-1 text-xs text-amber-500">
                            <AlertCircle className="w-3 h-3" /> Waiting
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filteredOrders.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">No orders found.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default PreorderAdminTab;
