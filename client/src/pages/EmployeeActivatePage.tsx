import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function EmployeeActivatePage() {
  const [search] = useSearchParams();
  const token = search.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) { toast.error("This invitation link is missing its token."); return; }
    if (password !== confirm) { toast.error("Passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await api.post("/employees/activate", { token, password });
      setComplete(true);
      toast.success(response.data?.message ?? "Your employee account is activated.");
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not activate the account. Ask your administrator for a new link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-lg rounded-3xl border border-white/10 bg-card p-6 shadow-2xl sm:p-9">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Truvi Ventures</p>
          <h1 className="mt-2 text-2xl font-semibold">{complete ? "Account activated" : "Activate your employee account"}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {complete
              ? "Your password has been set. Sign in using your official email address. If a phone number was recorded, complete the phone verification prompt at first login."
              : "Choose a strong password to finish setting up your secure employee account."}
          </p>
        </div>
        {!complete && (
          !token ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">This invitation link is incomplete. Ask your Truvi administrator to resend your activation email.</div> :
          <form onSubmit={submit} className="space-y-4">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">New password</span>
              <input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-white/15 bg-background px-3 py-3 outline-none focus:border-primary" placeholder="At least 12 characters" />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Confirm password</span>
              <input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full rounded-xl border border-white/15 bg-background px-3 py-3 outline-none focus:border-primary" placeholder="Re-enter your password" />
            </label>
            <p className="text-xs leading-5 text-muted-foreground">Use at least 12 characters, including uppercase and lowercase letters, a number, and a symbol. This one-time invitation expires 48 hours after issue.</p>
            <button disabled={busy} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50" type="submit">{busy ? "Activating…" : "Set password and activate"}</button>
          </form>
        )}
        {complete && <Link to="/login" className="mt-3 block rounded-xl bg-primary px-4 py-3 text-center font-semibold text-primary-foreground">Go to sign in</Link>}
        {!complete && <Link to="/login" className="mt-5 block text-center text-sm text-muted-foreground hover:text-foreground">Already activated? Sign in</Link>}
      </div>
    </main>
  );
}
