import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, Input, Label, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

/** Everything a developer uploads for a complete listing. Step 1 collects the
 *  core details; the rest is added on the project workspace right after. */
const UPLOAD_CHECKLIST = [
  "Project details (name, location, RERA, possession date)",
  "Floor plans, master plan & brochure (PDF)",
  "Project photos & videos",
  "Flat inventory (1BHK / 2BHK / 3BHK, sizes, prices)",
  "Amenities & specifications",
  "Payment plans & offers",
  "Construction progress updates",
  "Unit availability (available / sold / blocked)",
  "Sales contact details",
  "Legal documents (RERA, approvals, NOCs) — public after admin verification",
];

interface DeveloperOption { _id: string; name: string; email: string }

export default function NewProjectPage() {
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  const [form, setForm] = useState({
    name: "",
    description: "",
    city: "",
    location: "",
    reraNumber: "",
    possessionDate: "",
    salesName: "",
    salesPhone: "",
    salesEmail: "",
    commissionPercent: 3,
    developerId: "",
  });
  const [developers, setDevelopers] = useState<DeveloperOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Admins can assign the new listing to an existing developer.
  useEffect(() => {
    if (!isAdmin) return;
    api
      .get("/admin/users", { params: { role: "DEVELOPER" } })
      .then((res) => setDevelopers(res.data.users))
      .catch(() => {});
  }, [isAdmin]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/projects", {
        name: form.name,
        description: form.description,
        city: form.city,
        location: form.location,
        reraNumber: form.reraNumber || undefined,
        possessionDate: form.possessionDate || undefined,
        salesContact:
          form.salesName || form.salesPhone || form.salesEmail
            ? { name: form.salesName, phone: form.salesPhone, email: form.salesEmail }
            : undefined,
        commissionPercent: Number(form.commissionPercent),
        developerId: isAdmin && form.developerId ? form.developerId : undefined,
      });
      toast.success("Project created — now add plans, photos, inventory and documents.");
      // Straight into the full project workspace so every remaining detail
      // (floor plans, photos, inventory, amenities, payment plans, progress,
      // availability, legal docs) can be uploaded before admin review. Admins
      // land on the admin-branded workspace; developers on their own.
      navigate(isAdmin ? `/admin/listings/${data.project._id}` : `/developer/projects/${data.project._id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <h1 className="text-2xl font-semibold">New Project</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Step 1 — core details. After this you land on the project workspace to upload everything
        else. The listing goes public only after admin approval.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="border-white/10 glass text-white">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label className="text-foreground/90">Project name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border-white/15 bg-card text-white" />
            </div>
            <div>
              <Label className="text-foreground/90">Description</Label>
              <Textarea required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border-white/15 bg-card text-white" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-foreground/90">City</Label>
                <Input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="border-white/15 bg-card text-white" />
              </div>
              <div>
                <Label className="text-foreground/90">Location / Locality</Label>
                <Input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="border-white/15 bg-card text-white" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-foreground/90">RERA number</Label>
                <Input value={form.reraNumber} onChange={(e) => setForm({ ...form, reraNumber: e.target.value })} className="border-white/15 bg-card text-white" />
              </div>
              <div>
                <Label className="text-foreground/90">Possession date</Label>
                <Input type="date" value={form.possessionDate} onChange={(e) => setForm({ ...form, possessionDate: e.target.value })} className="border-white/15 bg-card text-white" />
              </div>
            </div>

            <div className="border-t border-white/10 pt-4">
              <p className="text-sm font-semibold text-foreground/90">Sales contact (shown on the listing)</p>
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label className="text-foreground/90">Name</Label>
                  <Input value={form.salesName} onChange={(e) => setForm({ ...form, salesName: e.target.value })} className="border-white/15 bg-card text-white" />
                </div>
                <div>
                  <Label className="text-foreground/90">Phone</Label>
                  <Input value={form.salesPhone} onChange={(e) => setForm({ ...form, salesPhone: e.target.value })} className="border-white/15 bg-card text-white" />
                </div>
                <div>
                  <Label className="text-foreground/90">Email</Label>
                  <Input type="email" value={form.salesEmail} onChange={(e) => setForm({ ...form, salesEmail: e.target.value })} className="border-white/15 bg-card text-white" />
                </div>
              </div>
            </div>

            <div>
              <Label className="text-foreground/90">Commission %</Label>
              <Input type="number" step="0.1" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: Number(e.target.value) })} className="border-white/15 bg-card text-white" />
            </div>

            {isAdmin && (
              <div className="border-t border-white/10 pt-4">
                <Label className="text-foreground/90">Assign to developer (optional)</Label>
                <select
                  value={form.developerId}
                  onChange={(e) => setForm({ ...form, developerId: e.target.value })}
                  className="mt-1 w-full rounded-md border border-white/15 bg-card px-3 py-2 text-sm text-white"
                >
                  <option value="">— Create under my admin account —</option>
                  {developers.map((dev) => (
                    <option key={dev._id} value={dev._id}>{dev.name} · {dev.email}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">Leave blank to own the listing yourself. The project starts as pending approval either way.</p>
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creating…" : "Create project & continue"}
            </Button>
          </form>
        </Card>

        {/* What a complete listing needs */}
        <Card className="h-fit border-white/10 glass text-white">
          <p className="text-sm font-semibold">Complete listing checklist</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You'll add these on the next screen — the project workspace:
          </p>
          <ul className="mt-3 space-y-2">
            {UPLOAD_CHECKLIST.map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs text-foreground/85">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-400" />
                {item}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
  );
}
