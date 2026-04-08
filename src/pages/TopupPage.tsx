import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ArrowLeft, CheckCircle, Loader2, XCircle, Shield, Zap, Wallet, Gift, Sparkles,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import KHQRPaymentCard from "@/components/KHQRPaymentCard";
import ModernPackageCard from "@/components/ModernPackageCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSite } from "@/contexts/SiteContext";
import { useCart } from "@/contexts/CartContext";
import { useFavicon } from "@/hooks/useFavicon";
import { useGameIdCache } from "@/hooks/useGameIdCache";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface VerifiedUser {
  username: string;
  id: string;
  serverId?: string;
  accountName?: string;
}

interface GameVerificationConfig {
  requires_zone: boolean;
  default_zone: string | null;
  alternate_api_codes: string[];
}

const TopupPage: React.FC = () => {
  const { gameSlug } = useParams();
  const navigate = useNavigate();
  const { games, paymentMethods, settings, isLoading } = useSite();
  const { addToCart } = useCart();
  const { user } = useAuth();

  useFavicon(settings.siteIcon);

  const game = games.find((g) => g.slug === gameSlug || g.id === gameSlug);
  const { cachedUserId, cachedServerId, saveToCache, hasCachedData } = useGameIdCache(game?.id);

  const [userId, setUserId] = useState("");
  const [serverId, setServerId] = useState("");
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  
  const [inlineQR, setInlineQR] = useState<{ qrCode: string; orderId: string; amount: number; wsUrl?: string; } | null>(null);
  const [generatingQR, setGeneratingQR] = useState(false);

  const [gameVerificationConfig, setGameVerificationConfig] = useState<GameVerificationConfig | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedUser, setVerifiedUser] = useState<VerifiedUser | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [alternateRegions, setAlternateRegions] = useState<string[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  useEffect(() => {
    const fetchVerificationConfig = async () => {
      if (!game?.name) return;
      try {
        let { data } = await supabase
          .from("game_verification_configs")
          .select("requires_zone, default_zone, alternate_api_codes")
          .eq("is_active", true)
          .ilike("game_name", game.name)
          .maybeSingle();

        if (!data) {
          const result = await supabase
            .from("game_verification_configs")
            .select("requires_zone, default_zone, alternate_api_codes, game_name")
            .eq("is_active", true)
            .ilike("game_name", `%${game.name.split(" ")[0]}%`)
            .limit(10);

          if (result.data && result.data.length > 0) {
            const exactMatch = result.data.find((r) => r.game_name.toLowerCase() === game.name.toLowerCase());
            const partialMatch = result.data.find((r) =>
              r.game_name.toLowerCase().includes(game.name.toLowerCase()) || game.name.toLowerCase().includes(r.game_name.toLowerCase()));
            data = exactMatch || partialMatch || result.data[0];
          }
        }

        if (data) {
          setGameVerificationConfig({ requires_zone: data.requires_zone, default_zone: data.default_zone, alternate_api_codes: data.alternate_api_codes || [] });
        } else {
          setGameVerificationConfig({ requires_zone: false, default_zone: null, alternate_api_codes: [] });
        }
      } catch (error) {
        console.error("Failed to fetch verification config:", error);
        setGameVerificationConfig({ requires_zone: false, default_zone: null, alternate_api_codes: [] });
      }
    };
    fetchVerificationConfig();
  }, [game?.name]);

  useEffect(() => {
    if (hasCachedData && !userId) {
      setUserId(cachedUserId);
      setServerId(cachedServerId);
    }
  }, [hasCachedData, cachedUserId, cachedServerId]);

  useEffect(() => {
    const fetchWalletBalance = async () => {
      if (!user) return;
      try {
        const { data: profile } = await supabase.from("profiles").select("wallet_balance").eq("user_id", user.id).single();
        setWalletBalance(profile?.wallet_balance || 0);
      } catch (error) { console.error("Failed to fetch wallet balance:", error); }
    };
    fetchWalletBalance();
  }, [user]);

  if (isLoading || (game && gameVerificationConfig === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-foreground">Game not found</h1>
          <Link to="/" className="text-primary hover:underline">Go back home</Link>
        </div>
      </div>
    );
  }

  const getGameIdConfig = (gameName: string) => {
    const normalizedName = gameName.toLowerCase().trim();
    const requiresZone = gameVerificationConfig?.requires_zone ?? false;

    const getFieldLabels = () => {
      if (normalizedName.includes("valorant") || normalizedName.includes("league of legends") || normalizedName === "lol" || normalizedName.includes("wild rift") || normalizedName.includes("teamfight tactics") || normalizedName === "tft" || normalizedName.includes("legends of runeterra") || normalizedName === "lor") {
        return { userLabel: "Riot ID", userPlaceholder: "Name#Tag", example: "ឧទាហរណ៍: PlayerName#1234" };
      }
      if (normalizedName.includes("mobile legends") || normalizedName === "mlbb" || normalizedName.includes("magic chess")) {
        return { userLabel: "User ID", userPlaceholder: "Enter your player/user ID", serverLabel: "Server ID", example: "ឧទាហរណ៍: 123456789 (1234)" };
      }
      if (normalizedName.includes("genshin") || normalizedName.includes("honkai") || normalizedName.includes("zenless zone zero") || normalizedName === "zzz" || normalizedName.includes("wuthering waves") || normalizedName.includes("tower of fantasy")) {
        return { userLabel: "UID", userPlaceholder: "បញ្ចូល UID", serverLabel: "Server", example: "ឧទាហរណ៍: 8001234567" };
      }
      if (normalizedName.includes("pubg")) {
        return { userLabel: "Character ID", userPlaceholder: "បញ្ចូល Character ID", example: "ឧទាហរណ៍: 5123456789" };
      }
      if (normalizedName.includes("call of duty") || normalizedName.includes("cod")) {
        return { userLabel: "Player UID", userPlaceholder: "បញ្ចូល Player UID", example: "ឧទាហរណ៍: 6742123456789" };
      }
      if (normalizedName.includes("clash of clans") || normalizedName === "coc" || normalizedName.includes("clash royale") || normalizedName.includes("brawl stars")) {
        return { userLabel: "Player Tag", userPlaceholder: "#ABC123", example: "ឧទាហរណ៍: #ABC123XY" };
      }
      if (normalizedName.includes("free fire")) {
        return { userLabel: "Player ID", userPlaceholder: "Enter your player ID", example: "ឧទាហរណ៍: 123456789" };
      }
      return { userLabel: "Player ID", userPlaceholder: "Enter your player ID", serverLabel: "Server", example: "ឧទាហរណ៍: 123456789" };
    };

    const labels = getFieldLabels();
    if (requiresZone) {
      return {
        fields: [
          { key: "userId", label: labels.userLabel, placeholder: labels.userPlaceholder },
          { key: "serverId", label: labels.serverLabel || "Server", placeholder: "Enter your server / zone", width: "w-full" },
        ],
        validation: `សូមបញ្ចូល ${labels.userLabel} និង ${labels.serverLabel || "Server"}`,
        example: labels.example,
      };
    }
    return {
      fields: [{ key: "userId", label: labels.userLabel, placeholder: labels.userPlaceholder }],
      validation: `សូមបញ្ចូល ${labels.userLabel}`,
      example: labels.example,
    };
  };

  const gameIdConfig = game ? getGameIdConfig(game.name) : null;
  const hasMultipleFields = gameIdConfig && gameIdConfig.fields.length > 1;

  const handleVerify = async (overrideRegion?: string) => {
    if (!userId.trim()) {
      toast({ title: gameIdConfig?.validation || "សូមបញ្ចូល Game ID", variant: "destructive" });
      return;
    }
    const zoneRequired = gameVerificationConfig?.requires_zone || hasMultipleFields;
    if (zoneRequired && !serverId.trim()) {
      toast({ title: "សូមបញ្ចូល Server ID", description: `${game?.name} requires a Server/Zone ID`, variant: "destructive" });
      return;
    }
    setIsVerifying(true);
    setVerificationError(null);
    setVerifiedUser(null);
    setAlternateRegions([]);
    try {
      const { data, error } = await supabase.functions.invoke("verify-game-id", {
        body: { gameName: game?.name, userId: userId.trim(), serverId: serverId.trim() || undefined, regionOverride: overrideRegion || selectedRegion || undefined },
      });
      if (error) {
        let msg = error.message || "Verification failed";
        const anyErr = error as any;
        if (anyErr?.context && typeof anyErr.context.json === "function") {
          try { const body = await anyErr.context.json(); msg = body?.error || body?.message || msg; if (body?.alternateRegions) setAlternateRegions(body.alternateRegions); } catch {}
        }
        throw new Error(msg);
      }
      if (data?.success) {
        if (data?.manualVerification) {
          const errorMsg = data?.message || "Automatic verification is unavailable.";
          setVerificationError(errorMsg);
          toast({ title: "ផ្ទៀងផ្ទាត់បរាជ័យ", description: errorMsg, variant: "destructive" });
          return;
        }
        const username = data.username || data.accountName;
        setVerifiedUser({ username, id: userId, serverId: serverId || undefined, accountName: data.accountName });
        saveToCache(userId, serverId);
        toast({ title: "✓ ផ្ទៀងផ្ទាត់ដោយជោគជ័យ", description: `Username: ${username}` });
      } else {
        const errorMsg = data?.error || "មិនអាចផ្ទៀងផ្ទាត់ ID បានទេ។";
        setVerificationError(errorMsg);
        if (data?.alternateRegions?.length > 0) setAlternateRegions(data.alternateRegions);
        toast({ title: "ផ្ទៀងផ្ទាត់បរាជ័យ", description: errorMsg, variant: "destructive" });
      }
    } catch (error: any) {
      const errorMsg = error?.message || "មិនអាចផ្ទៀងផ្ទាត់ ID បានទេ។";
      setVerificationError(errorMsg);
      toast({ title: "ផ្ទៀងផ្ទាត់បរាជ័យ", description: errorMsg, variant: "destructive" });
    } finally { setIsVerifying(false); }
  };

  const handleTryRegion = (regionCode: string) => { setSelectedRegion(regionCode); handleVerify(regionCode); };
  const handleUserIdChange = (value: string) => { setUserId(value); setVerifiedUser(null); setVerificationError(null); setAlternateRegions([]); setSelectedRegion(null); };
  const handleServerIdChange = (value: string) => { setServerId(value); setVerifiedUser(null); setVerificationError(null); setAlternateRegions([]); setSelectedRegion(null); };

  const handleSubmit = async () => {
    if (!userId) { toast({ title: "Please enter your Game ID", variant: "destructive" }); return; }
    if (!verifiedUser) { toast({ title: "សូមផ្ទៀងផ្ទាត់ ID របស់អ្នកជាមុនសិន", variant: "destructive" }); return; }
    if (!selectedPackage) { toast({ title: "Please select a package", variant: "destructive" }); return; }
    if (!selectedPayment) { toast({ title: "Please select a payment method", variant: "destructive" }); return; }
    if (!agreedToTerms) { toast({ title: "Please agree to the terms", variant: "destructive" }); return; }

    const pkg = game.packages.find((p) => p.id === selectedPackage) || game.specialPackages.find((p) => p.id === selectedPackage);
    if (!pkg) return;

    if (selectedPayment === "wallet") {
      if (!user) { toast({ title: "សូមចូលគណនីជាមុនសិន", variant: "destructive" }); navigate("/auth"); return; }
      if (walletBalance < pkg.price) { toast({ title: "សមតុល្យមិនគ្រប់គ្រាន់", description: `Balance: $${walletBalance.toFixed(2)}, Price: $${pkg.price.toFixed(2)}`, variant: "destructive" }); return; }
      setIsSubmitting(true);
      try {
        const { data: orderData, error: orderError } = await supabase.functions.invoke("process-topup", {
          body: { game_name: game.name, package_name: pkg.name, player_id: userId.trim(), server_id: serverId.trim() || null, player_name: verifiedUser.username, amount: pkg.price, currency: settings.packageCurrency || "USD", payment_method: "Wallet", kesorapi_product_id: pkg.kesorapiProductId || null, fulfill_quantity: pkg.quantity && pkg.quantity > 0 ? pkg.quantity : 1 },
        });
        if (orderError) throw orderError;
        const orderId = orderData?.order_id;
        if (!orderId) throw new Error("Failed to create order");
        const { data: walletResult, error: walletError } = await supabase.functions.invoke("wallet-topup", { body: { action: "purchase", amount: pkg.price, orderId } });
        if (walletError) throw walletError;
        if (walletResult?.error) throw new Error(walletResult.error);
        toast({ title: "✓ បង់ប្រាក់បានជោគជ័យ!", description: `Paid $${pkg.price.toFixed(2)} from wallet.` });
        navigate(`/invoice/${orderId}`);
      } catch (error: any) { toast({ title: "កំហុសក្នុងការបង់ប្រាក់", description: error.message, variant: "destructive" }); }
      finally { setIsSubmitting(false); }
      return;
    }

    const paymentMethod = paymentMethods.find((p) => p.id === selectedPayment);
    setGeneratingQR(true);
    setIsSubmitting(true);
    try {
      const { data: orderData, error: orderError } = await supabase.functions.invoke("process-topup", {
        body: { game_name: game.name, package_name: pkg.name, player_id: userId.trim(), server_id: serverId.trim() || null, player_name: verifiedUser.username, amount: pkg.price, currency: settings.packageCurrency || "USD", payment_method: paymentMethod?.name || "KHQR", kesorapi_product_id: pkg.kesorapiProductId || null, fulfill_quantity: pkg.quantity && pkg.quantity > 0 ? pkg.quantity : 1 },
      });
      if (orderError) throw orderError;
      const newOrderId = orderData?.order_id;
      if (!newOrderId) throw new Error("Failed to create order");
      const { data: qrData, error: qrError } = await supabase.functions.invoke("ikhode-payment", {
        body: { action: "generate-khqr", amount: pkg.price, orderId: newOrderId, playerName: verifiedUser.username, gameName: game.name },
      });
      if (qrError) throw qrError;
      if (!qrData?.qrCodeData) throw new Error(qrData?.error || "Failed to generate QR");
      setInlineQR({ qrCode: qrData.qrCodeData, orderId: newOrderId, amount: qrData.amount || pkg.price, wsUrl: qrData.wsUrl });
      setTimeout(() => { document.getElementById("inline-qr-section")?.scrollIntoView({ behavior: "smooth" }); }, 100);
    } catch (error: any) { toast({ title: "QR កំហុស", description: error.message, variant: "destructive" }); }
    finally { setGeneratingQR(false); setIsSubmitting(false); }
  };

  const selectedPkg = selectedPackage
    ? game.packages.find((p) => p.id === selectedPackage) || game.specialPackages.find((p) => p.id === selectedPackage)
    : null;

  return (
    <>
      <Helmet>
        <title>{game.name} Topup - {settings.siteName}</title>
        <meta name="description" content={`Top up ${game.name} instantly.`} />
      </Helmet>

      <div className="min-h-screen flex flex-col" style={{
        backgroundColor: settings.topupBackgroundColor || undefined,
        backgroundImage: settings.topupBackgroundImage ? `url(${settings.topupBackgroundImage})` : undefined,
        backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed",
      }}>
        <Header />

        <main className="flex-1 container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-5xl">
          {/* Back */}
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /><span>ត្រលប់ក្រោយ</span>
          </Link>

          {/* Banner */}
          {game.coverImage && (
            <div className="rounded-xl overflow-hidden border border-border/30 mb-4">
              <img src={game.coverImage} alt={game.name} className="w-full h-36 sm:h-48 object-cover" />
            </div>
          )}

          {/* Game badges */}
          <div className="flex items-center gap-3 text-xs mb-4">
            <span className="flex items-center gap-1 text-emerald-400"><Zap className="w-3 h-3" />Fast Delivery</span>
            <span className="flex items-center gap-1 text-primary"><Shield className="w-3 h-3" />Safety Guarantee</span>
          </div>

          {/* ===== GAME INFORMATION SECTION ===== */}
          <div className="rounded-xl border border-border/30 bg-card p-4 mb-4" style={{ backgroundColor: settings.idSectionBgColor || undefined, backgroundImage: settings.idSectionBgImage ? `url(${settings.idSectionBgImage})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
            <h2 className="font-bold text-sm mb-3" style={{ color: settings.idSectionTextColor || undefined }}>Game Information</h2>

            <div className="space-y-3">
              {gameIdConfig?.fields.map((field) => (
                <div key={field.key}>
                  <label className="text-xs text-muted-foreground mb-1 block">{field.label}</label>
                  <Input
                    placeholder={field.placeholder}
                    value={field.key === "userId" ? userId : serverId}
                    onChange={(e) => field.key === "userId" ? handleUserIdChange(e.target.value) : handleServerIdChange(e.target.value)}
                    className="bg-muted/50 border-border/50 rounded-lg"
                    disabled={isVerifying}
                  />
                </div>
              ))}
            </div>

            {verifiedUser && (
              <div className="mt-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  <span>Player Name: <strong>{verifiedUser.username}</strong></span>
                </div>
              </div>
            )}

            {verificationError && (
              <div className="mt-3 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30">
                <div className="flex items-start gap-2 text-destructive text-sm">
                  <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p>{verificationError}</p>
                    {alternateRegions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <p className="text-xs w-full mb-1">Try another region:</p>
                        {alternateRegions.map((region) => (
                          <Button key={region} size="sm" variant="outline" onClick={() => handleTryRegion(region)} disabled={isVerifying} className="h-6 text-xs">
                            {region.toUpperCase().replace(/-/g, " ")}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={() => handleVerify()}
              disabled={isVerifying || !userId.trim() || !!verifiedUser}
              className={cn("w-full mt-3 rounded-lg", verifiedUser ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90")}
            >
              {isVerifying ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />Checking...</>) : verifiedUser ? (<><CheckCircle className="w-4 h-4 mr-2" />Verified</>) : "Check Your Name"}
            </Button>
          </div>

          {/* ===== PACKAGES SECTION ===== */}
          {game.specialPackages && game.specialPackages.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-card p-4 mb-4" style={{ backgroundColor: settings.packageBgColor || undefined, backgroundImage: settings.packageBgImage ? `url(${settings.packageBgImage})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
              <div className="flex items-center gap-2 mb-3">
                <Gift className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-sm">Best Selling</span>
                <span className="text-xs text-muted-foreground ml-auto">{game.specialPackages.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {[...game.specialPackages].sort((a, b) => a.price - b.price).map((pkg) => (
                  <ModernPackageCard key={pkg.id} pkg={pkg} selected={selectedPackage === pkg.id} onSelect={() => setSelectedPackage(pkg.id)} variant="featured" gameDefaultIcon={game.defaultPackageIcon} />
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border/30 bg-card p-4 mb-4" style={{ backgroundColor: settings.packageBgColor || undefined, backgroundImage: settings.packageBgImage ? `url(${settings.packageBgImage})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-sm">Packages</span>
              <span className="text-xs text-muted-foreground">{game.packages.length}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {[...game.packages].sort((a, b) => a.price - b.price).map((pkg) => (
                <ModernPackageCard key={pkg.id} pkg={pkg} selected={selectedPackage === pkg.id} onSelect={() => setSelectedPackage(pkg.id)} gameDefaultIcon={game.defaultPackageIcon} />
              ))}
            </div>
          </div>

          {/* ===== PAYMENT SECTION ===== */}
          <div className="rounded-xl border border-border/30 bg-card p-4 mb-4" style={{ backgroundColor: settings.paymentSectionBgColor || undefined, backgroundImage: settings.paymentSectionBgImage ? `url(${settings.paymentSectionBgImage})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
            <h2 className="font-bold text-sm mb-3" style={{ color: settings.paymentSectionTextColor || undefined }}>Payment Methods</h2>

            <div className="grid grid-cols-4 gap-2 mb-4">
              <button onClick={() => setSelectedPayment("wallet")}
                className={cn("p-3 rounded-lg border transition-all flex flex-col items-center gap-1.5",
                  selectedPayment === "wallet" ? "border-emerald-500 bg-emerald-500/10" : "border-border/50 bg-muted/30 hover:border-border")}>
                <Wallet className="w-5 h-5 text-emerald-400" />
                <span className="text-[10px] text-muted-foreground">Wallet</span>
                {user && <span className="text-[9px] text-emerald-400">${walletBalance.toFixed(2)}</span>}
              </button>

              {paymentMethods.slice(0, 3).map((method) => (
                <button key={method.id} onClick={() => setSelectedPayment(method.id)}
                  className={cn("p-3 rounded-lg border transition-all flex flex-col items-center gap-1.5",
                    selectedPayment === method.id ? "border-primary bg-primary/10" : "border-border/50 bg-muted/30 hover:border-border")}>
                  {method.icon.startsWith("http") ? (
                    <img src={method.icon} alt={method.name} className="w-5 h-5 rounded object-cover" />
                  ) : (
                    <span className="text-lg">{method.icon}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground line-clamp-1">{method.name}</span>
                </button>
              ))}
            </div>

            {/* Scan and pay hint */}
            <p className="text-xs text-muted-foreground text-center mb-4">Scan And Pay With Other Bank</p>

            {/* Terms */}
            <label className="flex items-start gap-2 mb-4 cursor-pointer">
              <button onClick={() => setAgreedToTerms(!agreedToTerms)}
                className={cn("w-4 h-4 rounded border flex items-center justify-center transition-all flex-shrink-0 mt-0.5",
                  agreedToTerms ? "bg-primary border-primary" : "border-border")}>
                {agreedToTerms && <CheckCircle className="w-3 h-3 text-primary-foreground" />}
              </button>
              <span className="text-xs text-muted-foreground">
                By clicking Pay Now, you agree to our <span className="text-primary cursor-pointer">Terms and Conditions</span>.
              </span>
            </label>

            {/* Total + Pay */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total:</p>
                <p className="text-2xl font-bold text-foreground">{settings.packageCurrencySymbol || '$'}{selectedPkg?.price.toFixed(2) || "0.00"}</p>
              </div>
              <Button onClick={handleSubmit} disabled={isSubmitting || !agreedToTerms || !selectedPackage || !selectedPayment || !verifiedUser}
                className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-full disabled:opacity-50 hover:bg-primary/90">
                {isSubmitting ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />Processing...</>) : "Pay Now"}
              </Button>
            </div>
          </div>

          {/* ===== INLINE QR ===== */}
          {inlineQR && (
            <div id="inline-qr-section" className="mb-4">
              <KHQRPaymentCard
                qrCode={inlineQR.qrCode}
                amount={inlineQR.amount}
                currency={settings.packageCurrency || "USD"}
                orderId={inlineQR.orderId}
                description={`${game.name} - ${selectedPkg?.name || ""}`}
                onComplete={() => { setInlineQR(null); navigate(`/invoice/${inlineQR.orderId}`); }}
                onCancel={() => setInlineQR(null)}
                wsUrl={inlineQR.wsUrl}
              />
            </div>
          )}
        </main>

        <Footer />
      </div>
    </>
  );
};

export default TopupPage;
