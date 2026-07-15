import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { XCircle, RotateCcw, MessageCircle } from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { Button } from "@/components/ui/button";

const WA_SUPPORT =
  "https://wa.me/919196366358?text=Hi%20Truvi%20Support%2C%20my%20payment%20failed%20and%20I%20need%20help.";

export default function PaymentFailedPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const s = state as { planTitle?: string } | null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <main className="mx-auto grid max-w-lg place-items-center px-4 pt-32 pb-20 text-center">
        <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 16 }}>
          <XCircle size={64} className="text-red-400" />
        </motion.div>
        <h1 className="mt-5 font-display text-3xl font-semibold">Payment didn't go through</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {s?.planTitle ? <>Your payment for <span className="text-foreground">{s.planTitle}</span> couldn't be completed.</> : "Your payment couldn't be completed."}{" "}
          No money has been deducted. You can try again, or reach us on WhatsApp.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button onClick={() => navigate("/pricing")}>
            <RotateCcw size={15} className="mr-1" /> Try again
          </Button>
          <a href={WA_SUPPORT} target="_blank" rel="noopener noreferrer">
            <Button variant="outline">
              <MessageCircle size={15} className="mr-1" /> Chat with Truvi Support
            </Button>
          </a>
        </div>

        <Link to="/" className="mt-6 text-sm text-muted-foreground hover:text-foreground">
          Back to home
        </Link>
      </main>
    </div>
  );
}
