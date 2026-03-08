import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Wallet, Copy, Check, Timer, Smartphone, Shield, RefreshCw,
  Loader2, CheckCircle2, Sparkles, Zap, ArrowRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface KHQRPaymentCardProps {
  qrCode: string;
  amount: number;
  currency?: string;
  orderId: string;
  description?: string;
  onComplete?: () => void;
  onCancel?: () => void;
  expiresIn?: number;
  paymentMethod?: string;
  wsUrl?: string;
}

const KHQRPaymentCard = ({
  qrCode,
  amount,
  currency = "USD",
  orderId,
  description,
  onComplete,
  onCancel,
  expiresIn = 300,
  paymentMethod = "Bakong",
  wsUrl,
}: KHQRPaymentCardProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [timeLeft, setTimeLeft] = useState(expiresIn);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid" | "processing" | "completed">("pending");

  // Timer countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // WebSocket for real-time payment updates
  useEffect(() => {
    if (!wsUrl || paymentStatus !== "pending") return;

    try {
      const ws = new WebSocket(wsUrl);
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if ((data.type === 'payment_success' || data.type === 'payment_confirmed') && 
              (data.transactionId === orderId || data.orderId === orderId)) {
            handlePaymentSuccess();
          }
        } catch (e) {
          console.error('WebSocket message parse error:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      return () => {
        ws.close();
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
    }
  }, [wsUrl, paymentStatus, orderId]);

  // Polling for payment status (fallback)
  useEffect(() => {
    if (paymentStatus !== "pending") return;

    const pollInterval = setInterval(async () => {
      await checkPaymentStatus(true);
    }, 3000); // Check every 3 seconds

    return () => clearInterval(pollInterval);
  }, [paymentStatus, orderId]);

  const handlePaymentSuccess = async () => {
    setPaymentStatus("paid");
    toast({ title: "✅ ការបង់ប្រាក់បានជោគជ័យ!", description: "កំពុងដំណើរការការបញ្ជាទិញ..." });

    try {
      const { data: order } = await supabase
        .from("topup_orders")
        .select("status")
        .eq("id", orderId)
        .single();

      if (order?.status === "completed") {
        setPaymentStatus("completed");
        toast({ title: "🎉 បានបញ្ចប់!", description: "Top-up របស់អ្នកបានជោគជ័យ" });
      } else {
        setPaymentStatus("processing");
      }

      onComplete?.();
      setTimeout(() => navigate(`/invoice/${orderId}`), 2000);
    } catch (error) {
      console.error("Post-payment error:", error);
    }
  };

  const checkPaymentStatus = useCallback(async (silent = false) => {
    if (!silent) setChecking(true);

    try {
      const { data: order } = await supabase
        .from("topup_orders")
        .select("status")
        .eq("id", orderId)
        .single();

      if (order?.status === "completed" || order?.status === "paid" || order?.status === "processing") {
        await handlePaymentSuccess();
      } else if (!silent) {
        toast({
          title: "⏳ កំពុងរង់ចាំការទូទាត់",
          description: "សូមបញ្ចប់ការទូទាត់នៅក្នុងកម្មវិធីធនាគាររបស់អ្នក"
        });
      }
    } catch (error: any) {
      console.error("Payment check error:", error);
      if (!silent) {
        toast({ title: "កំហុសពិនិត្យការទូទាត់", description: error.message, variant: "destructive" });
      }
    } finally {
      if (!silent) setChecking(false);
    }
  }, [orderId, toast]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: `${label} បានចម្លង!` });
    setTimeout(() => setCopied(false), 2000);
  };

  const isExpired = timeLeft === 0;

  // Success state with celebration
  if (paymentStatus === "paid" || paymentStatus === "processing" || paymentStatus === "completed") {
    return (
      <Card className="overflow-hidden border-0 shadow-2xl">
        <div className="relative bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 p-8 text-white text-center overflow-hidden">
          {/* Animated background particles */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 bg-white/20 rounded-full animate-ping"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${2 + Math.random() * 2}s`,
                }}
              />
            ))}
          </div>

          <div className="relative z-10">
            <div className="w-24 h-24 mx-auto mb-4 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-14 h-14 animate-bounce" />
            </div>
            <h2 className="text-3xl font-bold mb-2">
              {paymentStatus === "paid" ? "ការបង់ប្រាក់បានទទួល!" :
               paymentStatus === "processing" ? "កំពុងដំណើរការ..." :
               "🎉 បានបញ្ចប់!"}
            </h2>
            <p className="text-white/90 text-lg">
              {paymentStatus === "processing"
                ? "កំពុងដំណើរការការបញ្ជាទិញរបស់អ្នក..."
                : "នឹងបញ្ជូនទៅវិក្កយបត្រ..."}
            </p>
            
            <div className="mt-6 flex items-center justify-center gap-2 text-white/80">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>សូមរង់ចាំ...</span>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-0 shadow-2xl bg-white">
      {/* KHQR Red Header Bar */}
      <div className="bg-gradient-to-r from-red-600 to-red-500 px-6 py-3 flex items-center justify-center">
        <span className="text-white font-bold text-xl tracking-wider">KHQR</span>
      </div>

      {/* Merchant Info */}
      <div className="px-6 pt-5 pb-2 text-center">
        <h2 className="text-2xl font-bold text-gray-900">{description || "Xavier TopUp"}</h2>
        <div className="flex items-baseline justify-center mt-1">
          <span className="text-3xl font-bold text-gray-900">
            {currency === "KHR" ? amount.toLocaleString() : amount.toFixed(2)}
          </span>
          <span className="text-xl font-bold text-gray-900 ml-1">{currency === "USD" ? "$" : "៛"}</span>
        </div>
      </div>

      <CardContent className="p-6 -mt-4 relative z-10">
        {/* QR Code Container */}
        <div className="relative mx-auto w-fit mb-6">
          {/* Decorative Frame */}
          <div className="absolute -inset-4 bg-gradient-to-br from-violet-500/20 via-purple-500/20 to-indigo-500/20 rounded-3xl blur-xl" />
          
          {/* Corner Accents */}
          <div className="absolute -top-2 -left-2 w-6 h-6 border-t-[3px] border-l-[3px] border-violet-500 rounded-tl-xl" />
          <div className="absolute -top-2 -right-2 w-6 h-6 border-t-[3px] border-r-[3px] border-purple-500 rounded-tr-xl" />
          <div className="absolute -bottom-2 -left-2 w-6 h-6 border-b-[3px] border-l-[3px] border-indigo-500 rounded-bl-xl" />
          <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-[3px] border-r-[3px] border-violet-500 rounded-br-xl" />

          <div className={`relative p-3 bg-white rounded-2xl shadow-xl transition-all duration-500 ${isExpired ? "opacity-40 grayscale blur-sm" : ""}`}>
            <img
              src={qrCode}
              alt="KHQR Payment Code"
              className="w-56 h-56 sm:w-64 sm:h-64 object-contain"
            />
            
            {/* Scan Animation */}
            {!isExpired && (
              <div className="absolute inset-3 overflow-hidden rounded-xl pointer-events-none">
                <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-violet-500 to-transparent animate-pulse opacity-50" 
                     style={{ animation: 'scanLine 2s ease-in-out infinite' }} />
              </div>
            )}
          </div>

          {isExpired && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl">
              <div className="text-center text-white p-4">
                <Timer className="w-10 h-10 mx-auto mb-2 text-orange-400" />
                <p className="font-bold text-lg">QR ផុតកំណត់</p>
                <p className="text-sm text-white/70">សូមផ្ទុកឡើងវិញ</p>
              </div>
            </div>
          )}
        </div>

        {/* Timer */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
            timeLeft < 60 
              ? "bg-red-500/10 text-red-500 border border-red-500/20" 
              : "bg-muted text-muted-foreground"
          }`}>
            <Timer className={`w-4 h-4 ${timeLeft < 60 ? "animate-pulse" : ""}`} />
            <span className="font-mono text-lg font-semibold">{formatTime(timeLeft)}</span>
          </div>
          <span className="text-sm text-muted-foreground">នៅសល់</span>
        </div>

        {/* Instructions */}
        <div className="bg-gradient-to-br from-muted/50 to-muted/30 rounded-2xl p-5 mb-6 border border-border/50">
          <h3 className="font-semibold text-sm text-foreground mb-4 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-violet-500" />
            របៀបបង់ប្រាក់
          </h3>
          <div className="space-y-3">
            {[
              { step: 1, text: "បើកកម្មវិធី Bakong ឬកម្មវិធីធនាគារ" },
              { step: 2, text: "ចុច Scan QR ហើយស្កេនកូដខាងលើ" },
              { step: 3, text: "បញ្ជាក់ការទូទាត់ - ប្រព័ន្ធនឹងដំណើរការដោយស្វ័យប្រវត្តិ" },
            ].map(({ step, text }) => (
              <div key={step} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-lg">
                  {step}
                </div>
                <p className="text-sm text-muted-foreground pt-0.5">{text}</p>
              </div>
            ))}
          </div>
          
          {/* Auto-confirm notice */}
          <div className="mt-4 pt-4 border-t border-border/50 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>ប្រព័ន្ធនឹងបញ្ជាក់ការទូទាត់ដោយស្វ័យប្រវត្តិក្រោយពេលស្កេនជោគជ័យ</span>
          </div>
        </div>

        {/* Order ID */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border border-border/50 mb-6">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Order ID</p>
            <p className="font-mono text-sm font-medium truncate max-w-[180px]">{orderId.slice(0, 12)}...</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => copyToClipboard(orderId, "Order ID")}
            className="h-9 w-9 rounded-lg hover:bg-background"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={() => checkPaymentStatus(false)}
            disabled={checking || isExpired}
            className="w-full h-12 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl font-semibold shadow-lg shadow-violet-500/25 transition-all duration-300 hover:shadow-violet-500/40"
          >
            {checking ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                កំពុងពិនិត្យ...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5 mr-2" />
                ខ្ញុំបានបង់ប្រាក់រួចហើយ
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>

          {onCancel && (
            <Button 
              variant="ghost" 
              onClick={onCancel} 
              className="w-full h-11 rounded-xl text-muted-foreground hover:text-foreground"
            >
              បោះបង់ការបញ្ជាទិញ
            </Button>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-border/50">
          <p className="text-xs text-center text-muted-foreground mb-3">
            គាំទ្រដោយធនាគារ Bakong ទាំងអស់
          </p>
          <div className="flex items-center justify-center gap-2 text-muted-foreground/60">
            <Shield className="w-4 h-4" />
            <span className="text-xs">Secured Payment by KHQR</span>
          </div>
        </div>
      </CardContent>

      <style>{`
        @keyframes scanLine {
          0%, 100% { transform: translateY(0); opacity: 0; }
          50% { transform: translateY(250px); opacity: 0.8; }
        }
      `}</style>
    </Card>
  );
};

export default KHQRPaymentCard;