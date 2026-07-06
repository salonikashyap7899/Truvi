import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input, Label, Card } from "@/components/ui/primitives";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await login(email, password);
      if (user.role !== "ADMIN" && user.approvalStatus !== "APPROVED") {
        navigate("/pending-approval");
      } else if (user.role === "ADMIN") navigate("/admin/dashboard");
      else if (user.role === "DEVELOPER") navigate("/developer/dashboard");
      else if (user.role === "CP") navigate("/cp/dashboard");
      else navigate("/buyer/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-transparent px-4">
      <Card className="w-full max-w-sm p-8">
        <Link to="/" className="mb-6 flex items-center gap-2 font-display text-base font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-[var(--trust)] to-[var(--tech)] text-[10px] font-bold">T</span>
          TRUVI VENTURES
        </Link>
        <h1 className="font-display text-2xl font-semibold text-[#fff]">Log in to Truvi</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="text-[#fff]"/>
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="text-[#fff]"/>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full bg-[var(--trust)] hover:bg-[var(--trust)]/85">
            {loading ? "Logging in…" : "Log in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            New here? <Link to="/signup" className="text-sky-400">Create an account</Link>
          </p>
        </form>
      </Card>
    </main>
  );
}
