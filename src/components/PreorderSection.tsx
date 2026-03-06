import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSite } from '@/contexts/SiteContext';
import { Calendar, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import SectionHeader from './SectionHeader';

interface PreorderGameDisplay {
  id: string;
  gameId: string;
  gameName: string;
  gameImage: string;
  gameSlug: string;
  packages: {
    id: string;
    name: string;
    price: number;
    scheduledAt: string | null;
    quantity?: number;
  }[];
}

const PreorderSection: React.FC = () => {
  const { games, settings } = useSite();
  const [preorderGames, setPreorderGames] = useState<PreorderGameDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPreorders = async () => {
      try {
        const { data: pgames } = await supabase
          .from('preorder_games')
          .select('id, game_id, is_active')
          .eq('is_active', true)
          .order('sort_order');

        if (!pgames || pgames.length === 0) { setLoading(false); return; }

        const { data: pkgs } = await supabase
          .from('preorder_packages')
          .select('*')
          .in('game_id', pgames.map(g => g.id))
          .order('sort_order');

        const display: PreorderGameDisplay[] = pgames
          .map(pg => {
            const game = games.find(g => g.id === pg.game_id);
            if (!game) return null;
            const gamePkgs = (pkgs || []).filter(p => p.game_id === pg.id);
            if (gamePkgs.length === 0) return null;
            return {
              id: pg.id,
              gameId: game.id,
              gameName: game.name,
              gameImage: game.image,
              gameSlug: game.slug || game.id,
              packages: gamePkgs.map(p => ({
                id: p.id,
                name: p.name,
                price: p.price,
                scheduledAt: p.scheduled_fulfill_at,
                quantity: p.quantity,
              }))
            };
          })
          .filter(Boolean) as PreorderGameDisplay[];

        setPreorderGames(display);
      } catch (err) {
        console.error('Failed to load preorder games:', err);
      } finally {
        setLoading(false);
      }
    };
    if (games.length > 0) loadPreorders();
  }, [games]);

  if (loading || preorderGames.length === 0) return null;

  return (
    <section className="container mx-auto px-4 py-6">
      <SectionHeader
        title="📦 Pre-Order"
        subtitle="បញ្ជាទិញមុន - ទទួលបាននៅពេលកំណត់"
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mt-4">
        {preorderGames.map(pg => {
          const lowestPrice = Math.min(...pg.packages.map(p => p.price));
          const nextDate = pg.packages
            .filter(p => p.scheduledAt)
            .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())[0]?.scheduledAt;

          return (
            <Link
              key={pg.id}
              to={`/topup/${pg.gameSlug}?preorder=true`}
              className="group relative rounded-xl overflow-hidden border border-border/40 hover:border-gold/50 transition-all hover:scale-[1.02]"
              style={{ backgroundColor: settings.gameCardBgColor || undefined }}
            >
              <div className="aspect-square relative overflow-hidden">
                <img
                  src={pg.gameImage}
                  alt={pg.gameName}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <Badge className="absolute top-2 left-2 bg-amber-500 text-white text-[10px]">
                  <Calendar className="w-3 h-3 mr-0.5" /> PRE-ORDER
                </Badge>
              </div>
              <div className="p-2">
                <h3 className="font-semibold text-xs truncate">{pg.gameName}</h3>
                <p className="text-[10px] text-muted-foreground">
                  ចាប់ពី {settings.packageCurrencySymbol || '$'}{lowestPrice.toFixed(2)}
                </p>
                {nextDate && (
                  <div className="flex items-center gap-1 text-[10px] text-amber-500 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {new Date(nextDate).toLocaleDateString()}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
};

export default PreorderSection;
