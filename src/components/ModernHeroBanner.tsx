import React, { useEffect, useState } from 'react';
import {
  Carousel, CarouselContent, CarouselItem, type CarouselApi,
} from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';

interface ModernHeroBannerProps {
  bannerImage?: string;
  bannerImages?: string[];
  bannerHeight?: number;
  autoplayDelay?: number;
  cornerBorderColor?: string;
  cornerBorderWidth?: number;
  imageFit?: 'contain' | 'cover';
}

const ModernHeroBanner: React.FC<ModernHeroBannerProps> = ({ 
  bannerImage, 
  bannerImages = [],
  bannerHeight = 200,
  autoplayDelay = 5000,
  imageFit = 'contain'
}) => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  const allImages = React.useMemo(() => {
    if (bannerImages && bannerImages.length > 0) return bannerImages;
    if (bannerImage) return [bannerImage];
    return [];
  }, [bannerImage, bannerImages]);

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    api.on('select', () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  const hasImages = allImages.length > 0;
  const hasMultipleImages = allImages.length > 1;

  if (!hasImages) {
    return (
      <div className="w-full rounded-xl overflow-hidden bg-card border border-border/30 py-10">
        <div className="text-center px-4">
          <h1 className="text-xl sm:text-3xl font-bold text-primary mb-1">Welcome to Top Up</h1>
          <p className="text-muted-foreground text-sm">Fast & Secure Game Top Up Service</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl overflow-hidden border border-border/30">
      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: 'start' }}
        plugins={hasMultipleImages ? [Autoplay({ delay: autoplayDelay, stopOnInteraction: false, stopOnMouseEnter: true })] : []}
        className="w-full"
      >
        <CarouselContent className="-ml-0">
          {allImages.map((image, index) => (
            <CarouselItem key={index} className="pl-0">
              <div className="w-full" style={imageFit === 'cover' ? { height: `${bannerHeight}px` } : undefined}>
                <img src={image} alt={`Banner ${index + 1}`}
                  className={`w-full block ${imageFit === 'cover' ? 'h-full object-cover object-center' : 'h-auto'}`} />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>

        {hasMultipleImages && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {allImages.map((_, index) => (
              <button key={index} onClick={() => api?.scrollTo(index)}
                className={`transition-all duration-300 rounded-full ${
                  current === index ? 'w-5 h-1.5 bg-primary' : 'w-1.5 h-1.5 bg-foreground/40 hover:bg-foreground/60'
                }`}
                aria-label={`Go to slide ${index + 1}`} />
            ))}
          </div>
        )}
      </Carousel>
    </div>
  );
};

export default ModernHeroBanner;
