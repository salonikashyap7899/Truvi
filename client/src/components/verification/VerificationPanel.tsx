import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Clock, AlertTriangle, HelpCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/primitives";

interface VerificationResult {
  status: "VERIFIED" | "PENDING" | "UNAVAILABLE";
  confidenceScore: number;
  riskFlags: string[];
  evidenceSources: { check?: string; category?: string; evidence?: unknown }[];
  checksRun: { check: string; category: string; weight: number; passed: boolean; error?: string }[];
  lastVerifiedAt?: string | null;
}
interface FraudFlag { _id: string; severity: "low" | "medium" | "high"; evidence: Record<string, unknown>; }

const STATUS = {
  VERIFIED: { label: "Verified", icon: ShieldCheck, cls: "text-emerald-300", ring: "var(--trust)" },
  PENDING: { label: "Pending", icon: Clock, cls: "text-amber-300", ring: "#f59e0b" },
  UNAVAILABLE: { label: "Unavailable", icon: HelpCircle, cls: "text-muted-foreground", ring: "#64748b" },
} as const;

/** Reads /api/verification/:projectId — status, animated score, risks, evidence. */
export default function VerificationPanel({ projectId, reloadKey }: { projectId: string; reloadKey?: number }) {
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [flags, setFlags] = useState<FraudFlag[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    api
      .get(`/verification/${projectId}`)
      .then((r) => { setResult(r.data.verification); setFlags(r.data.fraudFlags ?? []); })
      .catch(() => { setResult(null); setFlags([]); })
      .finally(() => setLoaded(true));
  }, [projectId, reloadKey]);

  if (loaded && !result) {
    return <div className="rounded-2xl border border-white/10 glass p-5 text-sm text-muted-foreground">Not yet verified. Run verification to generate a result.</div>;
  }
  if (!result) return <div className="rounded-2xl border border-white/10 glass p-5 text-sm text-muted-foreground">Loading…</div>;

  const s = STATUS[result.status];
  const StatusIcon = s.icon;

  return (
    <div className="rounded-2xl border border-white/10 glass p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
          <StatusIcon size={18} className={s.cls} /> Verification
        </h3>
        <Badge variant={result.status === "VERIFIED" ? "success" : result.status === "PENDING" ? "warning" : "default"}>{s.label}</Badge>
      </div>

      {/* Animated confidence ring */}
      <div className="mt-4 flex items-center gap-5">
        <div className="relative grid size-24 place-items-center">
          <svg className="size-24 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
            <motion.circle
              cx="50" cy="50" r="42" fill="none" stroke={s.ring} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 42}
              initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - result.confidenceScore / 100) }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <div className="absolute text-center">
            <div className="font-display text-2xl font-semibold">{result.confidenceScore}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">score</div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {result.checksRun.filter((c) => c.passed).length}/{result.checksRun.length} checks passed
          {result.lastVerifiedAt && <div className="mt-1">Last run: {new Date(result.lastVerifiedAt).toLocaleString("en-IN")}</div>}
        </div>
      </div>

      {/* Fraud flags */}
      {flags.length > 0 && (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-900/10 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-red-300"><AlertTriangle size={13} /> {flags.length} fraud flag{flags.length > 1 ? "s" : ""}</p>
          <ul className="mt-1.5 space-y-1">
            {flags.map((f) => (
              <li key={f._id} className="text-[11px] text-red-200/90"><span className="uppercase">{f.severity}</span> · {JSON.stringify(f.evidence)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Risk flags */}
      {result.riskFlags.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-amber-300">Open items</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {result.riskFlags.map((r, i) => (
              <li key={i} className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Evidence with source citations */}
      {result.evidenceSources.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-[var(--trust)]">Evidence &amp; sources ({result.evidenceSources.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {result.evidenceSources.map((e, i) => (
              <li key={i} className="rounded-lg border border-white/8 bg-white/[0.02] p-2 text-[11px]">
                <span className="font-medium text-white">{e.check}</span> <span className="text-muted-foreground">· {e.category}</span>
                <div className="mt-0.5 text-muted-foreground/80">{JSON.stringify(e.evidence)}</div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
