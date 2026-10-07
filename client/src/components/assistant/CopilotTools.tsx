import { useState } from "react";
import { Sparkles, Copy, Check, RefreshCw, MessageCircle, Target, Shield, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

/**
 * AI Sales Copilot — WhatsApp follow-ups, pitch scripts and objection
 * handling for partners. Rendered as the "Copilot" tab of the Truvi assistant
 * pop-up (alongside Ask Truvi); fills the space it's given.
 */

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

export default function CopilotTools() {
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

  const TABS: { id: CopilotMode; label: string; Icon: LucideIcon }[] = [
    { id: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
    { id: "pitch", label: "Pitch Script", Icon: Target },
    { id: "objection", label: "Objection Handler", Icon: Shield },
  ];

  return (
    <>
      <style>{`
        @keyframes truvi-bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>

      {/* Mode tabs */}
      <div className="mt-4 flex border-b border-white/10 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setMode(tab.id); setOutput(""); }}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${mode === tab.id ? "border-b-2 border-[var(--trust)] text-white" : "text-muted-foreground hover:text-foreground/90"}`}
          >
            <tab.Icon size={13} /> {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="-mx-1 flex-1 min-h-0 overflow-y-auto overscroll-contain px-1 py-4 space-y-3">
        {mode === "whatsapp" && (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Client Name</label>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Rahul Sharma" className="w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white outline-none focus:border-[var(--trust)] transition-colors" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Project Interested In</label>
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Skyline Residences" className="w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white outline-none focus:border-[var(--trust)] transition-colors" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Lead Stage</label>
              <select value={leadStage} onChange={(e) => setLeadStage(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#0d1219] px-3 py-2 text-sm text-white outline-none focus:border-[var(--trust)]">
                {["GENERATED","CONTACTED","SITE_VISIT","NEGOTIATION","BOOKING"].map((s) => (
                  <option key={s} value={s} style={{ backgroundColor: "#0d1219", color: "#fff" }}>{s.replace("_", " ")}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {mode === "pitch" && (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Project Name</label>
              <input value={pitchProject} onChange={(e) => setPitchProject(e.target.value)} placeholder="e.g. Skyline Residences" className="w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white outline-none focus:border-[var(--trust)] transition-colors" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Location</label>
              <input value={pitchLocation} onChange={(e) => setPitchLocation(e.target.value)} placeholder="e.g. Whitefield, Bangalore" className="w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white outline-none focus:border-[var(--trust)] transition-colors" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Starting Price</label>
              <input value={pitchPrice} onChange={(e) => setPitchPrice(e.target.value)} placeholder="e.g. ₹85 Lakhs" className="w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white outline-none focus:border-[var(--trust)] transition-colors" />
            </div>
          </>
        )}

        {mode === "objection" && (
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Select the buyer's objection</label>
            <select value={objection} onChange={(e) => setObjection(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#0d1219] px-3 py-2 text-sm text-white outline-none focus:border-[var(--trust)]">
              {COMMON_OBJECTIONS.map((o) => <option key={o} value={o} style={{ backgroundColor: "#0d1219", color: "#fff" }}>{o}</option>)}
            </select>
            <div className="mt-2">
              <label className="text-xs text-muted-foreground mb-1 block">Or type a custom objection</label>
              <input
                value={COMMON_OBJECTIONS.includes(objection) ? "" : objection}
                onChange={(e) => setObjection(e.target.value || COMMON_OBJECTIONS[0])}
                placeholder="Type a custom objection…"
                className="w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white outline-none focus:border-[var(--trust)] transition-colors"
              />
            </div>
          </div>
        )}

        {/* Output */}
        {output && (
          <div className="rounded-xl border border-[var(--trust)]/30 bg-[var(--trust)]/10 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-sky-300">Generated Script</p>
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
                <span key={i} className="h-2 w-2 rounded-full bg-blue-400" style={{ animation: `truvi-bounce 1.2s ease-in-out ${i*0.2}s infinite` }} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Generating…</p>
          </div>
        )}
      </div>

      {/* Generate button */}
      <div className="shrink-0 border-t border-white/10 pt-4">
        <button
          onClick={generate}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--trust)] to-[#2563eb] py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Sparkles size={14} />
          {loading ? "Generating…" : "Generate"}
        </button>
      </div>
    </>
  );
}
