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

/** Friendly labels for the server's validation field names, so a rejected
 *  create tells the developer exactly which field to fix. */
const FIELD_LABELS: Record<string, string> = {
  name: "Project name",
  description: "Description",
  city: "City",
  location: "Location",
  commissionPercent: "Commission %",
  brochureUrl: "Brochure URL",
  priceListUrl: "Price list URL",
  salesContact: "Sales contact",
};

/** Turn a server "Validation failed" response into a specific, human message
 *  (e.g. "Description: must be at least 10 characters") instead of a vague one. */
function validationMessage(data: any): string | null {
  const fieldErrors = data?.issues?.fieldErrors as Record<string, string[]> | undefined;
  if (!fieldErrors) return null;
  const first = Object.entries(fieldErrors).find(([, msgs]) => msgs?.length);
  if (!first) return null;
  const [field, msgs] = first;
  return `${FIELD_LABELS[field] ?? field}: ${msgs[0]}`;
}

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
  const [photos, setPhotos] = useState<File[]>([]);
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
      // Upload any project photos/videos chosen here as public gallery assets,
      // so the listing card is media-forward from the moment it's created.
      if (photos.length) {
        let uploaded = 0;
        for (const file of photos) {
          try {
            const isVideo = file.type.startsWith("video/");
            const fd = new FormData();
            fd.append("file", file);
            fd.append("category", isVideo ? "GALLERY_VIDEO" : "GALLERY_IMAGE");
            fd.append("title", file.name.replace(/\.[^.]+$/, "") || (isVideo ? "Project video" : "Project photo"));
            await api.post(`/presentation/${data.project._id}/assets`, fd, { headers: { "Content-Type": "multipart/form-data" } });
            uploaded += 1;
          } catch {
            /* skip a failed file, keep going */
          }
        }
        toast.success(`Project created${uploaded ? ` with ${uploaded} file${uploaded === 1 ? "" : "s"}` : ""} — now add plans, inventory and documents.`);
      } else {
        toast.success("Project created — now add plans, photos, inventory and documents.");
      }
      // Straight into the full project workspace so every remaining detail
      // (floor plans, photos, inventory, amenities, payment plans, progress,
      // availability, legal docs) can be uploaded before admin review. Admins
      // land on the admin-branded workspace; developers on their own.
      navigate(isAdmin ? `/admin/listings/${data.project._id}` : `/developer/projects/${data.project._id}`);
    } catch (err: any) {
      const data = err?.response?.data;
      toast.error(validationMessage(data) || data?.error || "Failed to create project");
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
              <Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border-white/15 bg-card text-white" />
            </div>
            <div>
              <Label className="text-foreground/90">Description</Label>
              <Textarea required minLength={10} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border-white/15 bg-card text-white" />
              <p className="mt-1 text-xs text-muted-foreground">
                At least 10 characters{form.description.trim().length > 0 ? ` (${form.description.trim().length} so far)` : ""}.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-foreground/90">City</Label>
                <Input required minLength={2} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="border-white/15 bg-card text-white" />
              </div>
              <div>
                <Label className="text-foreground/90">Location / Locality</Label>
                <Input required minLength={2} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="border-white/15 bg-card text-white" />
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

            {/* Project photos & videos — shown on the listing card immediately */}
            <div className="border-t border-white/10 pt-4">
              <p className="text-sm font-semibold text-foreground/90">Project photos &amp; videos</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add exterior / interior photos and walkthrough videos. The first photo becomes the listing cover. You can add more later. Max 50&nbsp;MB each.
              </p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 bg-card px-4 py-2 text-sm hover:border-blue-600">
                + Add photos &amp; videos
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    const tooBig = picked.filter((f) => f.size > 50 * 1024 * 1024);
                    const ok = picked.filter((f) => f.size <= 50 * 1024 * 1024);
                    if (tooBig.length) toast.error(`${tooBig.length} file${tooBig.length === 1 ? "" : "s"} skipped — over 50 MB`);
                    if (ok.length) setPhotos((prev) => [...prev, ...ok]);
                    e.target.value = "";
                  }}
                />
              </label>
              {photos.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {photos.map((file, i) => {
                    const isVideo = file.type.startsWith("video/");
                    return (
                      <div key={i} className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-black/40">
                        {isVideo ? (
                          <video src={URL.createObjectURL(file)} className="h-full w-full object-cover" muted playsInline />
                        ) : (
                          <img src={URL.createObjectURL(file)} alt={file.name} className="h-full w-full object-cover" />
                        )}
                        <button
                          type="button"
                          onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                          className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white hover:bg-black/80"
                          title="Remove"
                        >
                          ✕
                        </button>
                        {isVideo && (
                          <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">Video</span>
                        )}
                        {i === 0 && !isVideo && (
                          <span className="absolute bottom-1 left-1 rounded bg-blue-600/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">Cover</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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
