import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/primitives";
import { toast } from "sonner";
import { useSocketEvent } from "@/lib/socket";
import { User, Building2, Handshake, Search, FileText, Download } from "lucide-react";

type Purpose = "BUYER" | "DEVELOPER" | "CP" | "GUEST";

interface Enquiry {
  _id: string;
  email: string;
  name: string;
  purposeType: Purpose;
  message?: string;
  uploadUrl?: string;
  uploadFileName?: string;
  projectName?: string;
  createdAt: string;
}

const PURPOSE_META: Record<Purpose, { label: string; icon: React.ReactNode; variant: string; color: string }> = {
  BUYER: { label: "Buyer", icon: <User size={13} />, variant: "info", color: "text-blue-300 bg-blue-900/30 border-blue-700/50" },
  DEVELOPER: { label: "Developer", icon: <Building2 size={13} />, variant: "warning", color: "text-violet-300 bg-violet-900/30 border-violet-700/50" },
  CP: { label: "Channel Partner", icon: <Handshake size={13} />, variant: "success", color: "text-emerald-300 bg-emerald-900/30 border-emerald-700/50" },
  GUEST: { label: "Guest", icon: <Search size={13} />, variant: "default", color: "text-muted-foreground bg-white/5 border-white/15" },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AdminEnquiriesPage() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Purpose | "ALL">("ALL");

  async function load() {
    try {
      const res = await api.get("/enquiries");
      setEnquiries(res.data.enquiries);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load enquiries");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Real-time: new enquiry appears immediately in the feed
  useSocketEvent<Enquiry>("enquiry:new", (enquiry) => {
    setEnquiries((prev) => {
      if (prev.some((e) => e._id === enquiry._id)) return prev;
      return [enquiry, ...prev];
    });
    const meta = PURPOSE_META[enquiry.purposeType];
    toast.info(`New ${meta.label} enquiry from ${enquiry.name}`);
  });

  const filtered = filter === "ALL"
    ? enquiries
    : enquiries.filter((e) => e.purposeType === filter);

  const counts: Record<string, number> = { ALL: enquiries.length };
  (["BUYER", "DEVELOPER", "CP", "GUEST"] as Purpose[]).forEach((p) => {
    counts[p] = enquiries.filter((e) => e.purposeType === p).length;
  });

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <h1 className="text-2xl font-semibold">Enquiry Inbox</h1>
      <p className="mt-1 text-sm text-muted-foreground mb-6">
        Live feed of all visitor enquiries — tagged by purpose type.
      </p>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(["ALL", "BUYER", "DEVELOPER", "CP", "GUEST"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? "border-[var(--trust)] bg-[var(--trust)]/20 text-white"
                : "border-white/15 text-muted-foreground hover:border-white/30 hover:text-white"
            }`}
          >
            {f !== "ALL" && PURPOSE_META[f as Purpose].icon}
            {f === "ALL" ? "All" : PURPOSE_META[f as Purpose].label}
            <span className="ml-0.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">
              {counts[f] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Chat-style feed */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <div className="size-4 border-2 border-white/20 border-t-[var(--trust)] rounded-full animate-spin" />
          Loading enquiries…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 glass p-10 text-center">
          <p className="text-muted-foreground text-sm">No enquiries yet in this category.</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {filtered.map((e) => {
            const meta = PURPOSE_META[e.purposeType];
            return (
              <div
                key={e._id}
                className="rounded-2xl border border-white/10 glass p-4 flex flex-col gap-2"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="size-9 rounded-full border border-white/15 bg-white/5 flex items-center justify-center text-sm font-semibold text-white shrink-0">
                      {e.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{e.name}</p>
                      <a
                        href={`mailto:${e.email}`}
                        className="text-xs text-blue-400 hover:underline"
                      >
                        {e.email}
                      </a>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${meta.color}`}>
                      {meta.icon}
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(e.createdAt)}</span>
                  </div>
                </div>

                {/* Project reference */}
                {e.projectName && (
                  <p className="text-xs text-muted-foreground">
                    Re: <span className="text-white/70">{e.projectName}</span>
                  </p>
                )}

                {/* Message bubble */}
                {e.message && (
                  <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-foreground/90">
                    {e.message}
                  </div>
                )}

                {/* Attachment */}
                {e.uploadUrl && (
                  <a
                    href={e.uploadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs text-blue-400 hover:border-blue-500/50 hover:bg-blue-900/20 transition-colors self-start"
                  >
                    <FileText size={13} />
                    {e.uploadFileName || "Attachment"}
                    <Download size={11} className="ml-0.5 opacity-60" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
