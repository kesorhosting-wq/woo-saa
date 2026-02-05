import React from "react";
import { cn } from "@/lib/utils";
import { Package } from "@/contexts/SiteContext";
import { useSite } from "@/contexts/SiteContext";
import { useIsMobile } from "@/hooks/use-mobile";

interface PackageCardProps {
  pkg: Package;
  selected: boolean;
  onSelect: () => void;
}

const PackageCard: React.FC<PackageCardProps> = ({ pkg, selected, onSelect }) => {
  const { settings } = useSite();
  const isMobile = useIsMobile();

  // Icon size based on screen
  const iconSize = isMobile
    ? settings.packageIconSizeMobile || 50
    : settings.packageIconSizeDesktop || 32;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative w-full overflow-hidden transition-all duration-300",
        "hover:scale-[1.02] active:scale-[0.98]",
        selected && "ring-2 ring-darkBlue ring-offset-2 ring-offset-background"
      )}
    >
      {/* Label badge */}
      {pkg.label && (
        <div
          className="absolute top-0 left-0 right-0 z-20 flex items-center justify-center gap-1 px-2 py-0.5 rounded-t-lg"
          style={{
            backgroundColor: pkg.labelBgColor || "#dc2626",
          }}
        >
          {pkg.labelIcon && (
            <img
              src={pkg.labelIcon}
              alt=""
              className="w-4 h-4 object-contain"
            />
          )}
          <span
            className="text-[10px] sm:text-xs font-bold truncate"
            style={{ color: pkg.labelTextColor || "#ffffff" }}
          >
            {pkg.label}
          </span>
        </div>
      )}

      {/* Main container */}
      <div
        className={cn(
          "relative flex items-center rounded-lg overflow-hidden",
          "shadow-md hover:shadow-lg transition-shadow",
          pkg.label && "rounded-t-none"
        )}
        style={{
          height: `${Math.min(
            settings.packageHeight || 48,
            window.innerWidth < 640 ? 40 : settings.packageHeight || 48
          )}px`,
          background: settings.packageBgImage
            ? `url(${settings.packageBgImage})`
            : settings.packageBgColor
            ? settings.packageBgColor
            : "linear-gradient(135deg, #1b2a4a 0%, #0b1f3a 50%, #1b2a4a 100%)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          border: settings.packageBorderWidth
            ? `${settings.packageBorderWidth}px solid hsl(var(--dark-blue))`
            : "none",
          borderTop: pkg.label ? "none" : undefined,
        }}
      >
        {/* Left icon */}
        <div className="flex items-center px-2 sm:px-3">
          {pkg.icon ? (
            <img
              src={pkg.icon}
              alt=""
              className="object-contain flex-shrink-0"
              style={{ width: iconSize, height: iconSize }}
            />
          ) : settings.packageIconUrl ? (
            <img
              src={settings.packageIconUrl}
              alt=""
              className="object-contain flex-shrink-0"
              style={{ width: iconSize, height: iconSize }}
            />
          ) : (
            <span className="flex-shrink-0 text-3xl sm:text-xl">💎</span>
          )}
        </div>

        {/* Center text */}
        <div className="flex-1 flex flex-col items-center justify-center min-w-0 leading-tight">
          <span
            className="truncate text-xs sm:text-sm"
            style={{
              color: settings.packageTextColor || "#ffffff",
              fontWeight: settings.packageTextWeight || 700,
            }}
          >
            {pkg.amount.toLocaleString()}
          </span>
          <span
            className="truncate text-[10px] sm:text-xs"
            style={{
              color: settings.packageTextColor || "#ffffff",
              fontWeight: settings.packageTextWeight || 700,
              opacity: 0.9,
            }}
          >
            {pkg.name}
          </span>
        </div>

        {/* Right price section */}
        <div
          className="relative flex items-center justify-end pr-2 sm:pr-3 pl-3 sm:pl-6 h-full"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.35) 100%)",
          }}
        >
          <div
            className="absolute left-0 top-0 h-full w-3 sm:w-4"
            style={{
              background:
                "linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.25) 50%)",
            }}
          />

          <span
            className="whitespace-nowrap text-[10px] sm:text-sm"
            style={{
              color: settings.packagePriceColor || "#ffffff",
              fontWeight: settings.packagePriceWeight || 700,
            }}
          >
            {settings.packageCurrencySymbol || "$"}
            {pkg.price.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>

        {/* Selected checkmark */}
        {selected && (
          <div className="absolute -top-0.5 sm:-top-1 -right-0.5 sm:-right-1 w-4 h-4 sm:w-5 sm:h-5 bg-darkBlue rounded-full flex items-center justify-center z-10">
            <span className="text-primary-foreground text-[10px] sm:text-xs">
              ✓
            </span>
          </div>
        )}

        {/* Hover glow */}
        <div className="absolute inset-0 bg-gradient-to-r from-darkBlue/0 via-darkBlue/20 to-darkBlue/0 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      </div>
    </button>
  );
};

export default PackageCard;
