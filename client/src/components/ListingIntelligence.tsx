import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Landmark, Route, MapPin, TrendingUp, Leaf, Satellite, Users, Sparkles,
  ChevronDown, ChevronUp, CheckCircle2, Clock, MinusCircle, AlertTriangle, Loader2,
} from "lucide-react";

type IntelStatus = "VERIFIED" | "PENDING" | "UNAVAILABLE";

interface IntelItem {
  label: string;
  source: string;
  status: IntelStatus;
  detail?: string;
}

interface IntelCategory {
  key: string;
  title: string;
  items: IntelItem[];
  verifiedCount: number;
  totalCount: number;
}

interface ScoreSignal {
  label: string;
  score: number;
  max: number;
  sourceLabel: string;
  verified: boolean;
  lastUpdated: string | null;
}

interface IntelligenceProfile {
  projectId: string;
  projectName: string;
  generatedAt: string;
  categories: IntelCategory[];
  ai: {
    crossVerifiedSources: number;
    evidenceCount: number;
    riskFlags: string[];
    fraudSignals: string[];
    confidenceScore: number;
    scoreBreakdown?: ScoreSignal[];
    overallStatus: IntelStatus;
    decisionSummary: string;
  };
}

function scoreTier(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Excellent", color: "#22c55e" };
  if (score >= 60) return { label: "Good", color: "#3b82f6" };
  if (score >= 40) return { label: "Fair", color: "#f59e0b" };
  return { label: "Needs review", color: "#ef4444" };
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  government: <Landmark size={13} />,
  infrastructure: <Route size={13} />,
  location: <MapPin size={13} />,
  market: <TrendingUp size={13} />,
  environmental: <Leaf size={13} />,
  gis: <Satellite size={13} />,
  community: <Users size={13} />,
};

const STATUS_META: Record<IntelStatus, { icon: React.ReactNode; text: string; cls: string }> = {
  VERIFIED: { icon: <CheckCircle2 size={12} />, text: "Verified", cls: "text-green-400" },
  PENDING: { icon: <Clock size={12} />, text: "Pending", cls: "text-amber-400" },
  UNAVAILABLE: { icon: <MinusCircle size={12} />, text: "Unavailable", cls: "text-muted-foreground" },
};

function StatusChip({ status }: { status: IntelStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium shrink-0 ${m.cls}`}>
      {m.icon}
      {m.text}
    </span>
  );
}

export default function ListingIntelligence({ projectId }: { projectId: string }) {
  const [profile, setProfile] = useState<IntelligenceProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/inventory/${projectId}/intelligence`)
      .then((res) => { if (!cancelled) setProfile(res.data.intelligence); })
      .catch((err: any) => {
        if (!cancelled) setError(err?.response?.data?.error || "Failed to load intelligence data");
      });
    return () => { cancelled = true; };
  }, [projectId]);

  if (error) return <p className="text-xs text-red-400">{error}</p>;
  if (!profile) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 size={13} className="animate-spin" />
        Running Truvi AI verification…
      </div>
    );
  }

  const { ai } = profile;

  return (
    <div className="space-y-2">
      {/* ── Truvi AI Verification Engine summary ── */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-300 uppercase tracking-wide">
            <Sparkles size={12} />
            Truvi AI Verification Engine
          </p>
          <StatusChip status={ai.overallStatus} />
        </div>

        {/* ── Truvi Score™ + breakdown ── */}
        {(() => {
          const tier = scoreTier(ai.confidenceScore);
          const breakdown = ai.scoreBreakdown ?? [];
          return (
            <div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#e8c877]">Truvi Score™</p>
                  <p className="mt-0.5 flex items-baseline gap-1">
                    <span className="font-display text-3xl font-bold leading-none" style={{ color: tier.color }}>{ai.confidenceScore}</span>
                    <span className="text-xs text-muted-foreground">/ 100</span>
                  </p>
                </div>
                <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ color: tier.color, background: `${tier.color}22` }}>
                  {tier.label}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${ai.confidenceScore}%`, background: tier.color }} />
              </div>

              {breakdown.length > 0 && (
                <>
                  <button
                    onClick={() => setShowBreakdown((v) => !v)}
                    className="mt-2 flex items-center gap-1 text-[11px] font-medium text-sky-300"
                  >
                    {showBreakdown ? "Hide breakdown" : "Why this score?"}
                    {showBreakdown ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>

                  {showBreakdown && (
                    <div className="mt-2 space-y-2.5 border-t border-white/10 pt-2">
                      {breakdown.map((s) => {
                        const d = fmtDate(s.lastUpdated);
                        return (
                          <div key={s.label}>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-white/85">{s.label}</span>
                              <span className="font-semibold text-white">
                                {s.score}<span className="text-white/40">/{s.max}</span>
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.round((s.score / s.max) * 100)}%` }} />
                            </div>
                            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                              {s.verified
                                ? <CheckCircle2 size={10} className="shrink-0 text-green-400" />
                                : <Clock size={10} className="shrink-0 text-amber-400" />}
                              {s.verified ? "Source verified" : "Not yet verified"} · {s.sourceLabel}
                              {d ? ` · Updated ${d}` : ""}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>Cross-verified sources: <span className="text-white/80">{ai.crossVerifiedSources}</span></span>
          <span>Evidence collected: <span className="text-white/80">{ai.evidenceCount}</span></span>
        </div>

        {ai.riskFlags.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-white/10">
            {ai.riskFlags.map((flag) => (
              <p key={flag} className="flex items-start gap-1.5 text-[11px] text-amber-300">
                <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                {flag}
              </p>
            ))}
          </div>
        )}
        {ai.fraudSignals.map((sig) => (
          <p key={sig} className="flex items-start gap-1.5 text-[11px] text-red-400">
            <AlertTriangle size={11} className="shrink-0 mt-0.5" />
            {sig}
          </p>
        ))}

        <p className="text-[11px] text-foreground/80 border-t border-white/10 pt-2">
          {ai.decisionSummary}
        </p>
      </div>

      {/* ── Raw Data Sources: one accordion per category ── */}
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-1">
        Raw Data Sources — where every detail comes from
      </p>
      {profile.categories.map((cat) => {
        const isOpen = openCategory === cat.key;
        return (
          <div key={cat.key} className="rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => setOpenCategory(isOpen ? null : cat.key)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
            >
              <span className="flex items-center gap-2 text-xs font-medium text-white">
                <span className="text-muted-foreground">{CATEGORY_ICONS[cat.key]}</span>
                {cat.title}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-muted-foreground">
                  <span className="text-green-400 font-semibold">{cat.verifiedCount}</span>/{cat.totalCount} verified
                </span>
                {isOpen ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
              </span>
            </button>

            {isOpen && (
              <div className="border-t border-white/10 divide-y divide-white/5">
                {cat.items.map((item) => (
                  <div key={item.label} className="px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-foreground/90">{item.label}</p>
                      <StatusChip status={item.status} />
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Source: <span className="text-foreground/70">{item.source}</span>
                    </p>
                    {item.detail && (
                      <p className="mt-0.5 text-[10px] text-sky-300/80">{item.detail}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
