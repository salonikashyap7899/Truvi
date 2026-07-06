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
    overallStatus: IntelStatus;
    decisionSummary: string;
  };
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

function confidenceColor(score: number) {
  if (score >= 75) return "bg-green-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

export default function ListingIntelligence({ projectId }: { projectId: string }) {
  const [profile, setProfile] = useState<IntelligenceProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);

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

        {/* Confidence score */}
        <div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span>Confidence Score</span>
            <span className="text-white font-semibold">{ai.confidenceScore}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full ${confidenceColor(ai.confidenceScore)}`}
              style={{ width: `${ai.confidenceScore}%` }}
            />
          </div>
        </div>

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
