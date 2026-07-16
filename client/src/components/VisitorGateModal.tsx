import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { toast } from "sonner";
import { X, Upload, Loader2, User, Building2, Handshake } from "lucide-react";
import { Link } from "react-router-dom";

type Purpose = "BUYER" | "DEVELOPER" | "CP";

// Same option set + pill styling as the signup auth card.
const PURPOSE_OPTIONS: { id: Purpose; label: string; icon: React.ReactNode }[] = [
  { id: "BUYER", label: "Buyer", icon: <User size={16} /> },
  { id: "CP", label: "Channel Partner", icon: <Handshake size={16} /> },
  { id: "DEVELOPER", label: "Developer / Seller", icon: <Building2 size={16} /> },
];

const HEADING: Record<Purpose, string> = {
  BUYER: "Buyer Enquiry",
  DEVELOPER: "List Your Project",
  CP: "Channel Partner Enquiry",
};

const MESSAGE_PLACEHOLDER: Record<Purpose, string> = {
  BUYER: "Tell us about what you're looking for…",
  DEVELOPER: "Brief about your project…",
  CP: "Tell us about your partnership interests…",
};

interface Props {
  onClose: () => void;
  projectName?: string;
  projectId?: string;
}

export default function VisitorGateModal({ onClose, projectName, projectId }: Props) {
  const [purpose, setPurpose] = useState<Purpose>("BUYER");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

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

      await api.post("/enquiries", form, { headers: { "Content-Type": "multipart/form-data" } });

      toast.success("Enquiry submitted! Our team will reach out to you.");
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to submit enquiry");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "h-11 border-white/15 bg-white/5 text-white placeholder:text-white/30";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Gradient-bordered card — identical to the signup/login auth card */}
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[26px] p-px shadow-2xl"
        style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.22), rgba(59,130,246,0.3) 45%, rgba(255,255,255,0.05) 85%)" }}
      >
        <div className="relative rounded-[25px] bg-[#0a0d14]/95 p-6 sm:p-8">
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-white/10 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>

          {/* Logo — centered real wordmark */}
          <div className="flex flex-col items-center text-center">
            <span className="grid size-11 place-items-center overflow-hidden rounded-2xl bg-white p-1 shadow-[0_0_36px_rgba(59,130,246,0.4)]">
              <img src="/brand/icon.png" alt="Truvi" className="h-full w-full object-contain" />
            </span>
            <span className="mt-3 font-display text-[12px] font-semibold tracking-[0.35em] text-white/90">TRUVI</span>
          </div>

          <h1 className="mt-5 text-center font-display text-2xl font-medium text-white">{HEADING[purpose]}</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            {projectName ? `Enquiring about: ${projectName}` : "We'll get back to you shortly."}
          </p>

          {/* Purpose selector — signup-style pills */}
          <div className="mt-6 flex rounded-full border border-white/12 bg-white/[0.04] p-1">
            {PURPOSE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPurpose(opt.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-medium transition-all ${
                  purpose === opt.id
                    ? "bg-gradient-to-r from-[var(--trust)] to-[#2563eb] text-white shadow-[0_0_18px_rgba(59,130,246,0.35)]"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label>Your Name</Label>
              <Input type="text" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} />
            </div>
            <div>
              <Label>Email Address</Label>
              <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCls} />
            </div>
            <div>
              <Label>Message <span className="text-muted-foreground">(optional)</span></Label>
              <textarea
                placeholder={MESSAGE_PLACEHOLDER[purpose]}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>

            <div>
              <Label>
                Upload Document <span className="text-muted-foreground">(optional — PDF, image, doc)</span>
              </Label>
              <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 px-4 py-3 text-sm text-muted-foreground hover:border-blue-500/50 hover:text-blue-300 transition-colors">
                <Upload size={15} />
                {file ? <span className="text-white truncate">{file.name}</span> : <span>Click to attach a file</span>}
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

            <Button type="submit" disabled={loading} className="w-full bg-[var(--trust)] hover:bg-[var(--trust)]/85">
              {loading ? (<><Loader2 size={14} className="animate-spin mr-2" /> Submitting…</>) : "Submit Enquiry"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-sky-300 underline-offset-4 hover:underline" onClick={onClose}>
                Log in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
