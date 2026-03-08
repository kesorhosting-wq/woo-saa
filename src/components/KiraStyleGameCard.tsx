import React from 'react';
import { Link } from 'react-router-dom';
import { Game, useSite } from '@/contexts/SiteContext';
import { Star } from 'lucide-react';

interface KiraStyleGameCardProps {
  game: Game;
}

const KiraStyleGameCard: React.FC<KiraStyleGameCardProps> = ({ game }) => {
  const { settings } = useSite();
  
  return (
    <Link 
      to={`/topup/${game.slug || game.id}`} 
      className="group relative block rounded-xl overflow-hidden border transition-all duration-300 hover:shadow-lg hover:shadow-gold/10"
      style={{
        backgroundColor: settings.gameCardBgColor || undefined,
        borderColor: settings.gameCardBorderColor || undefined,
        backgroundImage: settings.gameCardFrameImage ? `url(${settings.gameCardFrameImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Game Image - Square 1:1 aspect ratio */}
      <div className="relative aspect-square overflow-hidden rounded-t-xl">
        <img 
          src={game.image} 
          alt={game.name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      </div>
      
      {/* Content below image */}
      <div 
        className="p-1.5 sm:p-2 space-y-1"
        style={{
          backgroundColor: settings.gameCardBgColor || undefined,
        }}
      >
        {/* Game name */}
        <h3 className="font-medium text-foreground text-[10px] sm:text-xs line-clamp-1">
          {game.name}
        </h3>
        
        {/* Featured badge */}
        {game.featured && (
          <div className="flex items-center gap-0.5 text-amber-400 text-[8px] sm:text-[10px]">
            <Star className="w-2 h-2 sm:w-2.5 sm:h-2.5 fill-current" />
            <span>Featured</span>
          </div>
        )}
        
        {/* TOP UP button with gradient */}
        <button className="w-full py-1 sm:py-1.5 px-1.5 rounded-lg bg-gradient-to-r from-primary to-accent text-primary-foreground text-[8px] sm:text-[10px] font-bold uppercase tracking-wide hover:brightness-110 transition-all shadow-md">
          TOP UP
        </button>
      </div>
    </Link>
  );
};

export default KiraStyleGameCard;
