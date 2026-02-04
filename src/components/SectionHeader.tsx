import React from 'react';
import { LucideIcon } from 'lucide-react';
import { useSite } from '@/contexts/SiteContext';

interface PreviewStyles {
  titleColor?: string;
  subtitleColor?: string;
  lineColor?: string;
  dotColor?: string;
}

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  align?: 'left' | 'center';
  previewStyles?: PreviewStyles; // For admin preview
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ 
  title, 
  subtitle, 
  icon: Icon,
  align = 'center',
  previewStyles
}) => {
  const { settings } = useSite();
  
  // Use preview styles if provided (admin preview), otherwise use settings
  const titleColor = previewStyles?.titleColor || settings.sectionHeaderTitleColor || undefined;
  const subtitleColor = previewStyles?.subtitleColor || settings.sectionHeaderSubtitleColor || undefined;
  const lineColor = previewStyles?.lineColor || settings.sectionHeaderLineColor || undefined;
  const dotColor = previewStyles?.dotColor || settings.sectionHeaderDotColor || undefined;
  
  // Container styles from settings
  const containerStyle: React.CSSProperties = previewStyles ? {} : {
    backgroundColor: settings.sectionHeaderBgColor || undefined,
    border: (settings.sectionHeaderBorderWidth || 0) > 0 
      ? `${settings.sectionHeaderBorderWidth}px solid ${settings.sectionHeaderBorderColor || 'transparent'}` 
      : undefined,
    borderRadius: settings.sectionHeaderBorderRadius || undefined,
    padding: settings.sectionHeaderPaddingY || settings.sectionHeaderPaddingX 
      ? `${settings.sectionHeaderPaddingY || 0}px ${settings.sectionHeaderPaddingX || 0}px` 
      : undefined,
  };

  return (
    <div 
      className={`mb-6 sm:mb-8 ${align === 'center' ? 'text-center' : 'text-left'}`}
      style={containerStyle}
    >
      {/* Title with icon */}
      <div className={`flex items-center gap-3 ${align === 'center' ? 'justify-center' : 'justify-start'}`}>
        {Icon && (
          <div 
            className={`p-2 rounded-lg shadow-gold ${!lineColor ? 'bg-gradient-to-br from-gold to-gold-dark' : ''}`}
            style={{ 
              background: lineColor 
                ? `linear-gradient(to bottom right, ${lineColor}, ${dotColor || lineColor})` 
                : undefined 
            }}
          >
            <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
          </div>
        )}
        <h2 
          className={`font-display text-xl sm:text-2xl md:text-3xl font-bold ${!titleColor ? 'text-foreground' : ''}`}
          style={{ color: titleColor }}
        >
          {title}
        </h2>
      </div>
      
      {/* Subtitle */}
      {subtitle && (
        <p 
          className={`mt-2 text-sm sm:text-base ${!subtitleColor ? 'text-muted-foreground' : ''}`}
          style={{ color: subtitleColor || undefined }}
        >
          {subtitle}
        </p>
      )}
      
      {/* Decorative line */}
      <div className={`mt-4 flex items-center gap-2 ${align === 'center' ? 'justify-center' : 'justify-start'}`}>
        <div 
          className={`w-8 sm:w-12 h-0.5 ${!lineColor ? 'bg-gradient-to-r from-transparent to-gold' : ''}`}
          style={{ 
            background: lineColor 
              ? `linear-gradient(to right, transparent, ${lineColor})` 
              : undefined 
          }}
        />
        <div 
          className={`w-2 h-2 rounded-full animate-pulse ${!dotColor ? 'bg-gold' : ''}`}
          style={{ backgroundColor: dotColor || undefined }}
        />
        <div 
          className={`w-16 sm:w-24 h-0.5 ${!lineColor ? 'bg-gold' : ''}`}
          style={{ backgroundColor: lineColor || undefined }}
        />
        <div 
          className={`w-2 h-2 rounded-full animate-pulse ${!dotColor ? 'bg-gold' : ''}`}
          style={{ backgroundColor: dotColor || undefined }}
        />
        <div 
          className={`w-8 sm:w-12 h-0.5 ${!lineColor ? 'bg-gradient-to-l from-transparent to-gold' : ''}`}
          style={{ 
            background: lineColor 
              ? `linear-gradient(to left, transparent, ${lineColor})` 
              : undefined 
          }}
        />
      </div>
    </div>
  );
};

export default SectionHeader;
