import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Timer, RefreshCw, Loader2, CheckCircle2, ArrowRight, X
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
  const [checking, setChecking] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid" | "processing" | "completed">("pending");

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
        } catch (e) { console.error('WS parse error:', e); }
      };
      ws.onerror = (error) => console.error('WS error:', error);
      return () => ws.close();
    } catch (error) { console.error('WS connection error:', error); }
  }, [wsUrl, paymentStatus, orderId]);

  useEffect(() => {
    if (paymentStatus !== "pending") return;
    const pollInterval = setInterval(async () => { await checkPaymentStatus(true); }, 3000);
    return () => clearInterval(pollInterval);
  }, [paymentStatus, orderId]);

  const handlePaymentSuccess = async () => {
    setPaymentStatus("paid");
    toast({ title: "✅ ការបង់ប្រាក់បានជោគជ័យ!", description: "កំពុងដំណើរការ..." });
    try {
      const { data: order } = await supabase.from("topup_orders").select("status").eq("id", orderId).single();
      if (order?.status === "completed") {
        setPaymentStatus("completed");
        toast({ title: "🎉 បានបញ្ចប់!", description: "Top-up បានជោគជ័យ" });
      } else { setPaymentStatus("processing"); }
      onComplete?.();
      setTimeout(() => navigate(`/invoice/${orderId}`), 2000);
    } catch (error) { console.error("Post-payment error:", error); }
  };

  const checkPaymentStatus = useCallback(async (silent = false) => {
    if (!silent) setChecking(true);
    try {
      const { data: order } = await supabase.from("topup_orders").select("status").eq("id", orderId).single();
      if (order?.status === "completed" || order?.status === "paid" || order?.status === "processing") {
        await handlePaymentSuccess();
      } else if (!silent) {
        toast({ title: "⏳ កំពុងរង់ចាំការទូទាត់", description: "សូមបញ្ចប់ការទូទាត់នៅក្នុងកម្មវិធីធនាគារ" });
      }
    } catch (error: any) {
      if (!silent) toast({ title: "កំហុស", description: error.message, variant: "destructive" });
    } finally { if (!silent) setChecking(false); }
  }, [orderId, toast]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isExpired = timeLeft === 0;

  // Success state
  if (paymentStatus === "paid" || paymentStatus === "processing" || paymentStatus === "completed") {
    return (
      <div className="w-full max-w-sm mx-auto rounded-3xl overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-600 p-8 text-white text-center shadow-2xl">
        <div className="w-20 h-20 mx-auto mb-4 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 animate-bounce" />
        </div>
        <h2 className="text-2xl font-bold mb-2">
          {paymentStatus === "completed" ? "🎉 បានបញ្ចប់!" : "កំពុងដំណើរការ..."}
        </h2>
        <p className="text-white/80">នឹងបញ្ជូនទៅវិក្កយបត្រ...</p>
        <Loader2 className="w-5 h-5 animate-spin mx-auto mt-4" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* KHQR GUI Card */}
      <div className="rounded-3xl overflow-hidden bg-white shadow-2xl border border-gray-100">
        
        {/* Red Header - KHQR Branding */}
        <div className="bg-[#E21A1A] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-[#E21A1A] font-black text-xs">KH</span>
            </div>
            <span className="text-white font-bold text-lg tracking-wide">KHQR</span>
          </div>
          {onCancel && (
            <button onClick={onCancel} className="text-white/80 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Amount Section */}
        <div className="px-6 pt-5 pb-3 text-center bg-gradient-to-b from-gray-50 to-white">
          <p className="text-gray-500 text-sm mb-1">{description || "Xavier TopUp"}</p>
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-4xl font-black text-gray-900">
              {currency === "KHR" ? amount.toLocaleString() : amount.toFixed(2)}
            </span>
            <span className="text-xl font-bold text-gray-500">
              {currency === "USD" ? "USD" : "KHR"}
            </span>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="px-6 py-4">
          <div className={`relative mx-auto w-fit transition-all duration-500 ${isExpired ? "opacity-30 grayscale blur-sm" : ""}`}>
            {/* QR Container with blue border */}
            <div className="p-3 border-[3px] border-[#0072BC] rounded-2xl bg-white">
              <img
                src={qrCode}
                alt="KHQR Code"
                className="w-60 h-60 object-contain"
              />
            </div>

            {/* Expired overlay */}
            {isExpired && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-2xl">
                <div className="text-center text-white">
                  <Timer className="w-8 h-8 mx-auto mb-2 text-orange-400" />
                  <p className="font-bold">QR ផុតកំណត់</p>
                </div>
              </div>
            )}
          </div>

          {/* Scan instruction */}
          <p className="text-center text-gray-400 text-sm mt-3">
            ស្កេន QR ដោយប្រើកម្មវិធី Bakong ឬធនាគារ
          </p>
        </div>

        {/* Timer Bar */}
        <div className="px-6 pb-3">
          <div className={`flex items-center justify-center gap-2 py-2 px-4 rounded-full mx-auto w-fit ${
            timeLeft < 60
              ? "bg-red-50 text-red-600"
              : "bg-blue-50 text-blue-600"
          }`}>
            <Timer className={`w-4 h-4 ${timeLeft < 60 ? "animate-pulse" : ""}`} />
            <span className="font-mono text-base font-bold">{formatTime(timeLeft)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 pb-5 space-y-2">
          <Button
            onClick={() => checkPaymentStatus(false)}
            disabled={checking || isExpired}
            className="w-full h-12 bg-[#0072BC] hover:bg-[#005a96] text-white rounded-xl font-semibold text-base shadow-lg"
          >
            {checking ? (
              <><Loader2 className="w-5 h-5 animate-spin mr-2" /> កំពុងពិនិត្យ...</>
            ) : (
              <><RefreshCw className="w-5 h-5 mr-2" /> ខ្ញុំបានបង់ប្រាក់រួចហើយ</>
            )}
          </Button>

          {onCancel && (
            <button
              onClick={onCancel}
              className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              បោះបង់
            </button>
          )}
        </div>

        {/* Footer Branding */}
        <div className="bg-gray-50 px-6 py-3 flex items-center justify-center gap-2 border-t border-gray-100">
          <div className="w-4 h-4 bg-[#E21A1A] rounded-sm flex items-center justify-center">
            <span className="text-white text-[6px] font-black">KH</span>
          </div>
          <span className="text-[10px] text-gray-400 tracking-wider uppercase">Powered by KHQR • Bakong</span>
        </div>
      </div>
    </div>
  );
};

export default KHQRPaymentCard;
