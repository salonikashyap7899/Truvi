import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";

/**
 * A subtle, additive background layer for the homepage: the best featured
 * property images pulled live from inventory, drifting slowly in soft 3D.
 * Purely decorative — pointer-events-none, low opacity, sits behind content.
 * Refetches on mount, so new/better uploads show up on the next visit.
 */

interface Item {
  _id: string;
  name: string;
  coverImageUrl: string | null;
}

// Fixed, spread-out slots that keep clear of the centred hero text.
const SLOTS = [
  { top: "16%", left: "6%", size: 150, delay: 0, dur: 13 },
  { top: "60%", left: "9%", size: 120, delay: 1.5, dur: 16 },
  { top: "24%", left: "80%", size: 160, delay: 0.8, dur: 15 },
  { top: "66%", left: "82%", size: 130, delay: 2.2, dur: 17 },
  { top: "42%", left: "88%", size: 100, delay: 1.1, dur: 14 },
  { top: "80%", left: "44%", size: 120, delay: 2.8, dur: 18 },
];

export function FloatingProperties() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    api
      .get("/public/projects", { params: { limit: 8 } })
      .then((r) => setItems((r.data.projects ?? []).filter((p: Item) => p.coverImageUrl)))
      .catch(() => setItems([]));
  }, []);

  if (items.length === 0) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 hidden overflow-hidden md:block">
      {SLOTS.map((s, i) => {
        const item = items[i % items.length];
        if (!item?.coverImageUrl) return null;
        return (
          <motion.div
            key={s.left + s.top}
            className="absolute overflow-hidden rounded-2xl border border-white/10 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]"
            style={{
              top: s.top,
              left: s.left,
              width: s.size,
              height: s.size * 0.72,
              opacity: 0.16,
              filter: "saturate(1.1)",
            }}
            initial={{ y: 0, rotate: -2 }}
            animate={{ y: [0, -22, 0], rotate: [-2, 2, -2] }}
            transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: "easeInOut" }}
          >
            <img src={item.coverImageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            {/* Blue-tinted glass wash to keep it in the brand palette and subtle. */}
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--trust)]/25 via-transparent to-[#0a0d14]/40" />
          </motion.div>
        );
      })}
    </div>
  );
}

export default FloatingProperties;
