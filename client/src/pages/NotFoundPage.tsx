import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { SiteNav } from "@/components/SiteNav";
import { Button } from "@/components/ui/button";

/**
 * 404 — mounted as the catch-all route. Keeps the site chrome (SiteNav) so a
 * lost visitor still has the full navigation, and offers the two most useful
 * next steps: home and the public property inventory.
 */
export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-xl text-center"
        >
          {/* Big gradient 404 */}
          <div
            className="select-none font-display font-extrabold leading-none"
            style={{
              fontSize: "clamp(6rem, 22vw, 12rem)",
              background: "linear-gradient(135deg, #7C5CFF, #A855F7)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            404
          </div>

          <h1 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
            This page took a wrong turn
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or may have moved.
            Let&apos;s get you back to verified properties on Truvi.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" onClick={() => navigate("/")}>
              Back to home
            </Button>
            <Button variant="outline" size="lg" onClick={() => navigate("/inventory")}>
              Browse properties
            </Button>
          </div>

          <div className="mt-10 text-xs text-muted-foreground">
            Think this is a mistake?{" "}
            <Link to="/" className="text-[var(--trust)] hover:underline">
              Contact Truvi support
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
