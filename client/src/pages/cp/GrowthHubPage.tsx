import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { CpHubNav } from "@/components/CpHubNav";
import { NotificationBell } from "@/components/NotificationBell";
import UserMenu from "@/components/UserMenu";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Award, Coins, Gift, Trophy, Star, Zap } from "lucide-react";
import type { Commission, Lead, User } from "@/types";

/**
 * Growth Hub — gamification. XP/coins are derived deterministically from real
 * activity (leads, visits, bookings) so the numbers always mean something.
 */

const TIERS = [
  { name: "DIAMOND", emoji: "🥇", minXp: 5000, className: "border-violet-400/40 bg-violet-500/10" },
  { name: "PLATINUM", emoji: "🥈", minXp: 2500, className: "border-sky-400/40 bg-sky-500/10" },
  { name: "GOLD", emoji: "🥉", minXp: 1000, className: "border-amber-400/40 bg-amber-500/10" },
  { name: "SILVER", emoji: "⭐", minXp: 300, className: "border-white/20 bg-white/5" },
  { name: "BRONZE", emoji: "🔰", minXp: 0, className: "border-orange-800/40 bg-orange-900/10" },
] as const;

const REWARDS = [
  { title: "₹500 Amazon Voucher", cost: 500, icon: "🎁" },
  { title: "Featured profile for 7 days", cost: 800, icon: "🌟" },
  { title: "5 free premium leads", cost: 1200, icon: "🎯" },
  { title: "Truvi merch kit", cost: 2000, icon: "🧢" },
];

export default function GrowthHubPage() {
  const user = useAuthStore((s) => s.user);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [leaderboard, setLeaderboard] = useState<User[]>([]);

  useEffect(() => {
    Promise.all([api.get("/leads"), api.get("/commissions"), api.get("/leaderboard")])
      .then(([l, c, lb]) => {
        setLeads(l.data.leads);
        setCommissions(c.data.commissions);
        setLeaderboard(lb.data.leaderboard);
      })
      .catch(() => {});
  }, []);

  const stats = useMemo(() => {
    const booked = leads.filter((l) => ["BOOKING", "REGISTRATION", "COMPLETED"].includes(l.stage)).length;
    const visits = leads.filter((l) => ["SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION", "COMPLETED"].includes(l.stage)).length;
    const xp = leads.length * 20 + visits * 60 + booked * 400 + commissions.length * 100;
    const coins = leads.length * 5 + booked * 150;
    return { booked, visits, xp, coins, totalLeads: leads.length };
  }, [leads, commissions]);

  const tier = TIERS.find((t) => stats.xp >= t.minXp) ?? TIERS[TIERS.length - 1];
  const nextTier = [...TIERS].reverse().find((t) => t.minXp > stats.xp);
  const progressToNext = nextTier ? Math.min(100, Math.round((stats.xp / nextTier.minXp) * 100)) : 100;

  const badges = [
    { name: "First Lead", earned: stats.totalLeads >= 1, icon: "🚀" },
    { name: "Lead Machine", earned: stats.totalLeads >= 10, icon: "⚙️" },
    { name: "Site Visit Star", earned: stats.visits >= 3, icon: "📍" },
    { name: "First Closing", earned: stats.booked >= 1, icon: "🤝" },
    { name: "Deal Maker", earned: stats.booked >= 5, icon: "💼" },
    { name: "Top 5 Ranker", earned: leaderboard.slice(0, 5).some((u) => u._id === user?._id), icon: "🏆" },
  ];

  const myRank = leaderboard.findIndex((l) => l._id === user?._id) + 1;

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Trophy size={22} className="text-amber-400" /> Growth Hub</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tiers · XP · Badges · Rewards — grow your rank, grow your earnings.</p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
      <CpHubNav />

      {/* Tier + XP + coins */}
      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className={cn("glass", tier.className)}>
          <p className="text-xs text-muted-foreground">Your Tier</p>
          <p className="mt-1 font-display text-3xl font-bold">{tier.emoji} {tier.name}</p>
          {nextTier && (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${progressToNext}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{nextTier.minXp - stats.xp} XP to {nextTier.emoji} {nextTier.name}</p>
            </>
          )}
        </Card>
        <Card className="border-white/10 glass">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Zap size={12} className="text-amber-400" /> XP Points</p>
          <p className="mt-1 font-display text-3xl font-bold">{stats.xp.toLocaleString("en-IN")}</p>
          <p className="mt-2 text-xs text-muted-foreground">+20 per lead · +60 per site visit · +400 per booking</p>
        </Card>
        <Card className="border-white/10 glass">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Coins size={12} className="text-yellow-400" /> Truvi Coins</p>
          <p className="mt-1 font-display text-3xl font-bold">{stats.coins.toLocaleString("en-IN")}</p>
          <p className="mt-2 text-xs text-muted-foreground">Redeem below · earn more by closing deals</p>
        </Card>
      </section>

      {/* Tier ladder */}
      <section className="mt-8">
        <h2 className="text-lg font-medium">Tier ladder</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {TIERS.map((t) => (
            <Card key={t.name} className={cn("glass text-center", t.name === tier.name ? t.className : "border-white/10 opacity-70")}>
              <p className="text-2xl">{t.emoji}</p>
              <p className="mt-1 text-sm font-semibold">{t.name}</p>
              <p className="text-[10px] text-muted-foreground">{t.minXp.toLocaleString("en-IN")}+ XP</p>
              {t.name === tier.name && <Badge variant="success" className="mt-1.5">You</Badge>}
            </Card>
          ))}
        </div>
      </section>

      {/* Badges */}
      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-medium"><Award size={16} className="text-sky-400" /> Achievements & Badges</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {badges.map((b) => (
            <Card key={b.name} className={cn("glass text-center", b.earned ? "border-emerald-500/40" : "border-white/10 opacity-50")}>
              <p className="text-2xl">{b.icon}</p>
              <p className="mt-1 text-xs font-medium">{b.name}</p>
              <p className={cn("text-[10px]", b.earned ? "text-emerald-400" : "text-muted-foreground")}>{b.earned ? "Earned" : "Locked"}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Redeem store + monthly rewards */}
      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-medium"><Gift size={16} className="text-pink-400" /> Redeem Store</h2>
          <div className="mt-3 space-y-2">
            {REWARDS.map((r) => (
              <Card key={r.title} className="flex items-center justify-between border-white/10 glass py-3">
                <p className="text-sm">{r.icon} {r.title}</p>
                <Button
                  size="sm"
                  variant={stats.coins >= r.cost ? "primary" : "outline"}
                  className="h-7 px-3 text-xs"
                  disabled={stats.coins < r.cost}
                  onClick={() => toast.success(`Redemption request sent for "${r.title}" — our team will contact you.`)}
                >
                  <Coins size={11} /> {r.cost}
                </Button>
              </Card>
            ))}
          </div>
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-lg font-medium"><Star size={16} className="text-amber-400" /> Monthly Rewards — Leaderboard</h2>
          <p className="mt-1 text-xs text-muted-foreground">Top 3 CPs this month win cash bonuses + priority leads.{myRank > 0 ? ` You're ranked #${myRank}.` : ""}</p>
          <div className="mt-3 space-y-2">
            {leaderboard.slice(0, 5).map((cp, i) => (
              <Card key={cp._id} className={cn("flex items-center justify-between border-white/10 glass py-3", cp._id === user?._id && "ring-1 ring-[var(--trust)]")}>
                <p className="text-sm">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`} {cp.name}{" "}
                  <Badge variant={(cp.cpTier || "silver").toLowerCase()}>{cp.cpTier}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">{cp.cpProfile?.totalBookings || 0} bookings{i < 3 ? ` · ₹${[10, 5, 2.5][i]}k bonus` : ""}</p>
              </Card>
            ))}
            {leaderboard.length === 0 && <p className="text-sm text-muted-foreground">Leaderboard warms up as CPs close deals.</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
