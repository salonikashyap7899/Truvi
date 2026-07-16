import { useState } from "react";
import { X, Sparkles, Copy, Check, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";

type CopilotMode = "whatsapp" | "pitch" | "objection";

const COMMON_OBJECTIONS = [
  "The price is too high",
  "The location is not good",
  "I need to think about it",
  "The builder is not well-known",
  "The project is still under construction",
  "I can find something cheaper elsewhere",
  "The EMI seems too high",
];

export default function AISalesCopilot() {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CopilotMode>("whatsapp");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // WhatsApp generator fields
  const [clientName, setClientName] = useState("");
  const [leadStage, setLeadStage] = useState("CONTACTED");
  const [projectName, setProjectName] = useState("");

  // Pitch fields
  const [pitchProject, setPitchProject] = useState("");
  const [pitchLocation, setPitchLocation] = useState("");
  const [pitchPrice, setPitchPrice] = useState("");

  // Objection fields
  const [objection, setObjection] = useState(COMMON_OBJECTIONS[0]);

  // Show for every signed-in user except ambassadors — hooks must come first.
  if (!user || user.role === "AMBASSADOR") return null;

  async function generate() {
    setLoading(true);
    setOutput("");
    try {
      let message = "";
      let context: Record<string, unknown> = {};

      if (mode === "whatsapp") {
        message = `Generate a WhatsApp follow-up message for my client.`;
        context = { clientName, leadStage, projectName };
      } else if (mode === "pitch") {
        message = `Generate a sales pitch script for the property.`;
        context = { projectName: pitchProject, location: pitchLocation, price: pitchPrice };
      } else {
        message = `The buyer's objection is: "${objection}"`;
        context = { objection };
      }

      const res = await api.post("/ai/chat", { message, propertyContext: context, mode });
      setOutput(res.data.reply);
    } catch {
      toast.error("AI is unavailable right now");
    } finally {
      setLoading(false);
    }
  }

  async function copyOutput() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }

  const TABS: { id: CopilotMode; label: string; emoji: string }[] = [
    { id: "whatsapp", label: "WhatsApp", emoji: "💬" },
    { id: "pitch", label: "Pitch Script", emoji: "🎯" },
    { id: "objection", label: "Objection Handler", emoji: "🛡️" },
  ];

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="AI Sales Copilot"
        className={`
          fixed bottom-20 right-6 z-50 flex items-center gap-2 rounded-full
          bg-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40
          transition-all duration-200 hover:bg-purple-500
          ${open ? "opacity-0 pointer-events-none scale-90" : "opacity-100 scale-100"}
        `}
      >
        <Sparkles size={15} />
        AI Copilot
      </button>

      {open && <div className="fixed inset-0 z-40 bg-black/50 sm:hidden" onClick={() => setOpen(false)} />}

      {/* Panel */}
      <div
        className={`
          fixed z-50 flex flex-col bg-card shadow-2xl shadow-black/60
          transition-all duration-300 ease-out
          bottom-0 left-0 right-0 rounded-t-2xl border-t border-x border-white/10
          sm:bottom-6 sm:right-6 sm:left-auto sm:w-[420px] sm:rounded-2xl sm:border sm:border-white/10
          ${open ? "translate-y-0 opacity-100" : "translate-y-full sm:translate-y-8 opacity-0 pointer-events-none"}
        `}
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-600/20">
              <Sparkles size={14} className="text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">AI Sales Copilot</p>
              <p className="text-[10px] text-muted-foreground">Your personal sales assistant</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-white/10 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setMode(tab.id); setOutput(""); }}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${mode === tab.id ? "border-b-2 border-purple-500 text-white" : "text-muted-foreground hover:text-foreground/90"}`}
            >
              {tab.emoji} {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {mode === "whatsapp" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Client Name</label>
                <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Rahul Sharma" className="w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white outline-none focus:border-purple-500 transition-colors" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Project Interested In</label>
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Skyline Residences" className="w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white outline-none focus:border-purple-500 transition-colors" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Lead Stage</label>
                <select value={leadStage} onChange={(e) => setLeadStage(e.target.value)} className="w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white outline-none">
                  {["GENERATED","CONTACTED","SITE_VISIT","NEGOTIATION","BOOKING"].map((s) => (
                    <option key={s} value={s}>{s.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {mode === "pitch" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Project Name</label>
                <input value={pitchProject} onChange={(e) => setPitchProject(e.target.value)} placeholder="e.g. Skyline Residences" className="w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white outline-none focus:border-purple-500 transition-colors" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Location</label>
                <input value={pitchLocation} onChange={(e) => setPitchLocation(e.target.value)} placeholder="e.g. Whitefield, Bangalore" className="w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white outline-none focus:border-purple-500 transition-colors" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Starting Price</label>
                <input value={pitchPrice} onChange={(e) => setPitchPrice(e.target.value)} placeholder="e.g. ₹85 Lakhs" className="w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white outline-none focus:border-purple-500 transition-colors" />
              </div>
            </>
          )}

          {mode === "objection" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Select the buyer's objection</label>
              <select value={objection} onChange={(e) => setObjection(e.target.value)} className="w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white outline-none">
                {COMMON_OBJECTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <div className="mt-2">
                <label className="text-xs text-muted-foreground mb-1 block">Or type a custom objection</label>
                <input
                  value={COMMON_OBJECTIONS.includes(objection) ? "" : objection}
                  onChange={(e) => setObjection(e.target.value || COMMON_OBJECTIONS[0])}
                  placeholder="Type a custom objection…"
                  className="w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white outline-none focus:border-purple-500 transition-colors"
                />
              </div>
            </div>
          )}

          {/* Output */}
          {output && (
            <div className="rounded-xl border border-purple-800 bg-purple-950/20 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-purple-300">Generated Script</p>
                <div className="flex gap-2">
                  <button onClick={generate} className="text-muted-foreground hover:text-white transition-colors" title="Regenerate">
                    <RefreshCw size={13} />
                  </button>
                  <button onClick={copyOutput} className="text-muted-foreground hover:text-white transition-colors" title="Copy">
                    {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{output}</p>
            </div>
          )}

          {loading && (
            <div className="rounded-xl border border-white/10 glass p-4 flex items-center gap-3">
              <div className="flex gap-1">
                {[0,1,2].map((i) => (
                  <span key={i} className="h-2 w-2 rounded-full bg-purple-400" style={{ animation: `truvi-bounce 1.2s ease-in-out ${i*0.2}s infinite` }} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Generating…</p>
            </div>
          )}
        </div>

        {/* Generate button */}
        <div className="shrink-0 border-t border-white/10 px-4 py-3">
          <button
            onClick={generate}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Sparkles size={14} />
            {loading ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes truvi-bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </>
  );
}
