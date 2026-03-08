import React from 'react';
import { LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  align?: 'left' | 'center';
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ 
  title, 
  subtitle, 
  icon: Icon,
  align = 'left' 
}) => {
  return (
    <div className={`mb-4 sm:mb-6 ${align === 'center' ? 'text-center' : 'text-left'}`}>
      <div className={`flex items-center gap-2 ${align === 'center' ? 'justify-center' : 'justify-start'}`}>
        {Icon && <Icon className="w-5 h-5 text-primary" />}
        <h2 className="text-lg sm:text-xl font-bold text-foreground">
          {title}
        </h2>
      </div>
      {subtitle && (
        <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  );
};

export default SectionHeader;
