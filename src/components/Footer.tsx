import React from "react";
import { useSite, SocialLink } from "@/contexts/SiteContext";

interface FooterProps {
  backgroundColor?: string;
  textColor?: string;
  copyrightText?: string;
  socialIcons?: { telegram?: string; tiktok?: string; facebook?: string };
  socialUrls?: { telegram?: string; tiktok?: string; facebook?: string };
  socialLinks?: SocialLink[];
  textLines?: string[];
  paymentIcons?: string[];
  paymentIconSize?: number;
}

const Footer: React.FC<FooterProps> = ({
  backgroundColor,
  textColor,
  copyrightText,
  socialIcons,
  socialUrls,
  socialLinks = [],
  paymentIcons,
  paymentIconSize = 28,
}) => {
  const { settings } = useSite();

  const allSocialLinks: SocialLink[] = [
    ...(socialIcons?.telegram ? [{ id: "telegram", icon: socialIcons.telegram, url: socialUrls?.telegram || "#", name: "Telegram" }] : []),
    ...(socialIcons?.tiktok ? [{ id: "tiktok", icon: socialIcons.tiktok, url: socialUrls?.tiktok || "#", name: "TikTok" }] : []),
    ...(socialIcons?.facebook ? [{ id: "facebook", icon: socialIcons.facebook, url: socialUrls?.facebook || "#", name: "Facebook" }] : []),
    ...socialLinks,
  ];

  return (
    <footer className="mt-auto border-t border-border/20">
      <div
        className="py-4 sm:py-6"
        style={{
          backgroundColor: backgroundColor || "hsl(var(--muted))",
          color: textColor || "hsl(var(--muted-foreground))",
        }}
      >
        <div className="container mx-auto px-4 text-center space-y-3">
          {/* Social icons */}
          {allSocialLinks.length > 0 && (
            <div className="flex justify-center gap-3">
              {allSocialLinks.map((social) => (
                <a key={social.id} href={social.url || "#"} target="_blank" rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-foreground/10 hover:bg-foreground/20 transition-colors"
                  title={social.name}>
                  <img src={social.icon} alt={social.name} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}

          {/* Payment icons */}
          {paymentIcons && paymentIcons.length > 0 && (
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="text-xs opacity-70" style={{ color: textColor }}>We Accept:</span>
              {paymentIcons.map((icon, index) => (
                <img key={index} src={icon} alt={`Payment ${index + 1}`}
                  style={{ height: `${paymentIconSize}px` }}
                  className="w-auto object-contain" />
              ))}
            </div>
          )}

          {/* Copyright */}
          <p className="text-xs opacity-70" style={{ color: textColor }}>
            {copyrightText || `Copyright @${settings.siteName}. All Rights Reserved`}
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
