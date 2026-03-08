import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Receipt, Wallet, Menu, LogIn, LogOut, User } from 'lucide-react';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import LanguageSwitcher from './LanguageSwitcher';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const Header: React.FC = () => {
  const isMobile = useIsMobile();
  const { settings } = useSite();
  const { user, isAdmin, signOut } = useAuth();
  const { t } = useLanguage();
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!user) { setWalletBalance(null); return; }
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('wallet_balance')
          .eq('user_id', user.id)
          .single();
        setWalletBalance(profile?.wallet_balance || 0);
      } catch (error) {
        console.error('Failed to fetch wallet balance:', error);
      }
    };
    fetchBalance();

    if (user) {
      const channel = supabase
        .channel('header-wallet-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${user.id}` },
          (payload) => {
            if (payload.new && 'balance_after' in payload.new) {
              setWalletBalance((payload.new as any).balance_after);
            }
          }
        )
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    setMobileMenuOpen(false);
    toast({ title: t('header.signedOut') || 'Signed out successfully' });
  };

  const MobileMenuItem = ({ to, icon: Icon, label, onClick }: { to?: string; icon: React.ElementType; label: string; onClick?: () => void }) => {
    if (onClick) {
      return (
        <button onClick={onClick} className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-card/50 hover:bg-primary/10 border border-border/30 transition-colors text-left">
          <Icon className="w-5 h-5 text-primary" />
          <span className="text-foreground font-medium">{label}</span>
        </button>
      );
    }
    return (
      <Link to={to!} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-card/50 hover:bg-primary/10 border border-border/30 transition-colors">
        <Icon className="w-5 h-5 text-primary" />
        <span className="text-foreground font-medium">{label}</span>
      </Link>
    );
  };

  return (
    <header 
      className="relative px-4 py-3 border-b"
      style={{
        backgroundColor: settings.headerBgColor || undefined,
        borderColor: settings.headerBorderColor || undefined,
        backgroundImage: settings.headerImage ? `url(${settings.headerImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        color: settings.headerTextColor || undefined,
      }}
    >
      {settings.headerImage && <div className="absolute inset-0 bg-background/80" />}

      <div className="container mx-auto flex items-center justify-between relative z-10">
        {/* Left - Logo */}
        <div className="flex items-center gap-3">
          {isMobile && (
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <button className="p-2 rounded-lg border border-border/50 bg-card hover:bg-primary/10 transition-colors">
                  <Menu className="w-5 h-5 text-primary" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] bg-background border-border/30">
                <SheetHeader className="border-b border-border/30 pb-4">
                  <SheetTitle className="flex items-center gap-2">
                    {settings.logoUrl ? (
                      <img src={settings.logoUrl} alt={settings.siteName} className="h-8 object-contain" />
                    ) : (
                      <span className="text-primary font-bold text-xl">{settings.siteName}</span>
                    )}
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-3 mt-6">
                  {user && walletBalance !== null && (
                    <Link to="/wallet" onClick={() => setMobileMenuOpen(false)} className="flex items-center justify-between px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <div className="flex items-center gap-3">
                        <Wallet className="w-5 h-5 text-emerald-400" />
                        <span className="text-emerald-400 font-medium">{t('header.wallet')}</span>
                      </div>
                      <span className="text-emerald-400 font-bold">${walletBalance.toFixed(2)}</span>
                    </Link>
                  )}
                  {user && (
                    <>
                      <MobileMenuItem to="/orders" icon={Receipt} label={t('header.orders')} />
                      <MobileMenuItem to="/profile" icon={User} label={t('header.profile') || 'Profile'} />
                    </>
                  )}
                  {user && isAdmin && <MobileMenuItem to="/admin" icon={Settings} label={t('header.admin')} />}
                  <div className="px-4 py-3 rounded-lg bg-card/50 border border-border/30">
                    <div className="flex items-center justify-between">
                      <span className="text-foreground font-medium">{t('header.language') || 'Language'}</span>
                      <LanguageSwitcher />
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border/30">
                    {user ? (
                      <MobileMenuItem icon={LogOut} label={t('header.signOut') || 'Sign Out'} onClick={handleSignOut} />
                    ) : (
                      <MobileMenuItem to="/auth" icon={LogIn} label={t('header.login')} />
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          )}

          <Link to="/" className="flex items-center gap-2">
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt={settings.siteName} style={{ height: `${isMobile ? Math.min(settings.logoSize || 36, 36) : (settings.logoSize || 40)}px` }} className="object-contain" />
            ) : (
              <span className="text-primary font-bold text-lg sm:text-xl tracking-wide">{settings.siteName}</span>
            )}
          </Link>
        </div>

        {/* Right - Navigation */}
        <div className="flex items-center gap-2">
          {!isMobile && <LanguageSwitcher />}

          {!isMobile && user && walletBalance !== null && (
            <Link to="/wallet" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-400 transition-all">
              <Wallet className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-bold text-emerald-400">${walletBalance.toFixed(2)}</span>
            </Link>
          )}

          {!isMobile && user && (
            <Link to="/orders" className="p-2 rounded-lg border border-border/50 bg-card hover:bg-primary/10 transition-colors" title={t('header.orders')}>
              <Receipt className="w-4 h-4 text-primary" />
            </Link>
          )}

          {!isMobile && user && isAdmin && (
            <Link to="/admin" className="p-2 rounded-lg border border-border/50 bg-card hover:bg-primary/10 transition-colors" title={t('header.admin')}>
              <Settings className="w-4 h-4 text-primary" />
            </Link>
          )}

          {!user ? (
            <Link to="/auth" className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
              {t('header.login') || 'LOGIN'}
            </Link>
          ) : (
            !isMobile && (
              <button onClick={handleSignOut} className="p-2 rounded-lg border border-border/50 bg-card hover:bg-destructive/10 transition-colors" title={t('header.signOut') || 'Sign Out'}>
                <LogOut className="w-4 h-4 text-muted-foreground" />
              </button>
            )
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
