import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { toast } from "sonner";
import { X, Upload, Loader2, User, Building2, Handshake, Search } from "lucide-react";
import { Link } from "react-router-dom";

type Purpose = "BUYER" | "DEVELOPER" | "CP" | "GUEST";

interface Option {
  id: Purpose;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const OPTIONS: Option[] = [
  {
    id: "BUYER",
    label: "Buyer",
    description: "I'm looking to purchase a property",
    icon: <User size={20} />,
    color: "from-blue-600/30 to-blue-900/20 border-blue-500/40",
  },
  {
    id: "DEVELOPER",
    label: "Developer",
    description: "I want to list my project",
    icon: <Building2 size={20} />,
    color: "from-violet-600/30 to-violet-900/20 border-violet-500/40",
  },
  {
    id: "CP",
    label: "Channel Partner",
    description: "I'm interested in channel partnership",
    icon: <Handshake size={20} />,
    color: "from-emerald-600/30 to-emerald-900/20 border-emerald-500/40",
  },
  {
    id: "GUEST",
    label: "Just Browsing",
    description: "I'm exploring, no enquiry needed",
    icon: <Search size={20} />,
    color: "from-white/5 to-white/0 border-white/15",
  },
];

interface Props {
  onClose: () => void;
  projectName?: string;
  projectId?: string;
}

export default function VisitorGateModal({ onClose, projectName, projectId }: Props) {
  const [step, setStep] = useState<"purpose" | "details">("purpose");
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function selectPurpose(p: Purpose) {
    setPurpose(p);
    if (p === "GUEST") {
      onClose();
      return;
    }
    setStep("details");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!purpose || !name.trim() || !email.trim()) return;

    setLoading(true);
    try {
      const form = new FormData();
      form.append("email", email.trim());
      form.append("name", name.trim());
      form.append("purposeType", purpose);
      if (message.trim()) form.append("message", message.trim());
      if (projectId) form.append("projectId", projectId);
      if (projectName) form.append("projectName", projectName);
      if (file) form.append("file", file);

      await api.post("/enquiries", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success("Enquiry submitted! Our team will reach out to you.");
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to submit enquiry");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Gradient-bordered card — matches the signup/login auth UI */}
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[26px] p-px shadow-2xl"
        style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.22), rgba(59,130,246,0.3) 45%, rgba(255,255,255,0.05) 85%)" }}
      >
       <div className="relative rounded-[25px] bg-[#0a0d14]/95 p-6">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-white/10 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>

        {/* Logo — centered, real wordmark icon (matches signup) */}
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="grid size-11 place-items-center overflow-hidden rounded-2xl bg-white p-1 shadow-[0_0_36px_rgba(59,130,246,0.4)]">
            <img src="/brand/icon.png" alt="Truvi" className="h-full w-full object-contain" />
          </span>
          <span className="mt-3 font-display text-[12px] font-semibold tracking-[0.35em] text-white/90">TRUVI</span>
        </div>

        {step === "purpose" && (
          <>
            <h2 className="text-lg font-semibold text-white">Welcome to Truvi Inventory</h2>
            <p className="mt-1 text-sm text-muted-foreground mb-5">
              What brings you here today?
            </p>

            <div className="space-y-2.5">
              {OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => selectPurpose(opt.id)}
                  className={`w-full rounded-xl border bg-gradient-to-br ${opt.color} p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99]`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-white/70">{opt.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-white">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-sky-400 hover:underline" onClick={onClose}>
                Log in
              </Link>
            </p>
          </>
        )}

        {step === "details" && purpose && (
          <>
            <button
              onClick={() => setStep("purpose")}
              className="mb-4 text-xs text-muted-foreground hover:text-white transition-colors"
            >
              ← Back
            </button>

            <h2 className="text-lg font-semibold text-white">
              {purpose === "BUYER" && "Buyer Enquiry"}
              {purpose === "DEVELOPER" && "List Your Project"}
              {purpose === "CP" && "Channel Partner Enquiry"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground mb-5">
              {projectName ? `Enquiring about: ${projectName}` : "We'll get back to you shortly."}
            </p>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label>Your Name</Label>
                <Input
                  type="text"
                  placeholder="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="text-white"
                />
              </div>
              <div>
                <Label>Email Address</Label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="text-white"
                />
              </div>
              <div>
                <Label>Message <span className="text-muted-foreground">(optional)</span></Label>
                <textarea
                  placeholder={
                    purpose === "BUYER"
                      ? "Tell us about what you're looking for…"
                      : purpose === "DEVELOPER"
                      ? "Brief about your project…"
                      : "Tell us about your partnership interests…"
                  }
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-white/15 glass px-3 py-2 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* File upload for non-guest */}
              <div>
                <Label>
                  Upload Document <span className="text-muted-foreground">(optional — PDF, image, doc)</span>
                </Label>
                <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 px-4 py-3 text-sm text-muted-foreground hover:border-blue-500/50 hover:text-blue-300 transition-colors">
                  <Upload size={15} />
                  {file ? (
                    <span className="text-white truncate">{file.name}</span>
                  ) : (
                    <span>Click to attach a file</span>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && f.size > 10 * 1024 * 1024) {
                        toast.error("File too large — max 10 MB");
                        return;
                      }
                      setFile(f || null);
                    }}
                  />
                </label>
                {file && (
                  <button
                    type="button"
                    onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                    className="mt-1 text-xs text-red-400 hover:underline"
                  >
                    Remove file
                  </button>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[var(--trust)] hover:bg-[var(--trust)]/85"
              >
                {loading ? (
                  <><Loader2 size={14} className="animate-spin mr-2" /> Submitting…</>
                ) : (
                  "Submit Enquiry"
                )}
              </Button>
            </form>
          </>
        )}
       </div>
      </div>
    </div>
  );
}
