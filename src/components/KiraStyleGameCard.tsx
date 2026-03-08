import React from 'react';
import { Link } from 'react-router-dom';
import { Game, useSite } from '@/contexts/SiteContext';

interface KiraStyleGameCardProps {
  game: Game;
}

const KiraStyleGameCard: React.FC<KiraStyleGameCardProps> = ({ game }) => {
  const { settings } = useSite();
  
  return (
    <Link 
      to={`/topup/${game.slug || game.id}`} 
      className="group block rounded-xl overflow-hidden border border-border/30 bg-card transition-all duration-200 hover:border-primary/50 hover:shadow-md"
      style={{
        backgroundColor: settings.gameCardBgColor || undefined,
        borderColor: settings.gameCardBorderColor || undefined,
        backgroundImage: settings.gameCardFrameImage ? `url(${settings.gameCardFrameImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Game Image */}
      <div className="aspect-square overflow-hidden">
        <img 
          src={game.image} 
          alt={game.name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      </div>
      
      {/* Content */}
      <div className="p-1.5 sm:p-2 space-y-1" style={{ backgroundColor: settings.gameCardBgColor || undefined }}>
        <h3 className="font-medium text-foreground text-[10px] sm:text-xs line-clamp-1">
          {game.name}
        </h3>
        
        <button className="w-full py-1 sm:py-1.5 rounded-md bg-primary text-primary-foreground text-[8px] sm:text-[10px] font-bold uppercase tracking-wide hover:bg-primary/90 transition-colors">
          TOP UP
        </button>
      </div>
    </Link>
  );
};

export default KiraStyleGameCard;
