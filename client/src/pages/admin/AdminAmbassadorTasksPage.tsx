import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, Badge, Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MapPin, Clock, IndianRupee, FileText, Plus, ArrowLeft, CheckCircle2 } from "lucide-react";
import type { AmbassadorTask } from "@/types";

function statusBadge(status: AmbassadorTask["status"]) {
  if (status === "AVAILABLE") return <Badge variant="success">Available</Badge>;
  if (status === "LOCKED") return <Badge variant="warning">In progress</Badge>;
  return <Badge variant="danger">Completed</Badge>;
}

const EMPTY_FORM = {
  title: "",
  address: "",
  mapUrl: "",
  deadline: "",
  instructions: "",
  payoutAmount: "500",
};

export default function AdminAmbassadorTasksPage() {
  const [tasks, setTasks] = useState<AmbassadorTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [creating, setCreating] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.get("/ambassador-tasks/admin/all");
      setTasks(res.data.tasks ?? []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.address || !form.deadline) {
      toast.error("Title, address, and deadline are required");
      return;
    }
    setCreating(true);
    try {
      await api.post("/ambassador-tasks", {
        title: form.title,
        address: form.address,
        mapUrl: form.mapUrl || undefined,
        deadline: new Date(form.deadline).toISOString(),
        instructions: form.instructions || undefined,
        payoutAmount: Number(form.payoutAmount) || 500,
      });
      toast.success("Task created");
      setForm({ ...EMPTY_FORM });
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to create task");
    } finally {
      setCreating(false);
    }
  }

  async function markPaid(id: string) {
    setPayingId(id);
    try {
      await api.patch(`/ambassador-tasks/${id}/paid`);
      toast.success("Payout marked as paid");
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to mark paid");
    } finally {
      setPayingId(null);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const completedUnpaid = tasks.filter((t) => t.status === "COMPLETED" && !t.payoutPaid).length;

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <Link to="/admin/dashboard" className="inline-flex items-center gap-1 text-sm text-blue-400 hover:underline">
        <ArrowLeft size={14} /> Back to admin dashboard
      </Link>

      <div className="mt-4 flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Ambassador Tasks</h1>
        <p className="text-sm text-muted-foreground">
          Create site-verification tasks and release ₹500 payouts once ambassadors complete them.
        </p>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
        {/* Create form */}
        <section>
          <Card className="border-white/10 glass p-6">
            <p className="flex items-center gap-2 text-lg font-semibold">
              <Plus size={18} /> New task
            </p>
            <form onSubmit={createTask} className="mt-5 space-y-4">
              <div>
                <Label>Title *</Label>
                <Input value={form.title} onChange={set("title")} placeholder="Emerald Heights — Site Verification" className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label>Address *</Label>
                <Input value={form.address} onChange={set("address")} placeholder="Gachibowli Main Road, Hyderabad 500032" className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/30" />
              </div>
              <div>
                <Label>Google Maps URL</Label>
                <Input value={form.mapUrl} onChange={set("mapUrl")} placeholder="https://maps.google.com/?q=..." className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/30" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Deadline *</Label>
                  <Input type="datetime-local" value={form.deadline} onChange={set("deadline")} className="h-11 border-white/15 bg-white/5 text-white" />
                </div>
                <div>
                  <Label>Payout (₹)</Label>
                  <Input type="number" value={form.payoutAmount} onChange={set("payoutAmount")} className="h-11 border-white/15 bg-white/5 text-white" />
                </div>
              </div>
              <div>
                <Label>Instructions</Label>
                <textarea
                  value={form.instructions}
                  onChange={set("instructions")}
                  rows={3}
                  placeholder="What should the ambassador photograph / verify on site?"
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30"
                />
              </div>
              <Button type="submit" variant="primary" className="w-full" disabled={creating}>
                {creating ? "Creating…" : "Create task"}
              </Button>
            </form>
          </Card>
        </section>

        {/* Task list */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">All tasks</h2>
            <span className="text-sm text-muted-foreground">
              {tasks.length} total{completedUnpaid > 0 && ` · ${completedUnpaid} payout${completedUnpaid === 1 ? "" : "s"} due`}
            </span>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-muted-foreground">Loading…</div>
          ) : tasks.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-muted-foreground">
              No tasks yet. Create one using the form.
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <Card key={task._id} className="border-white/10 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {statusBadge(task.status)}
                        {task.status === "COMPLETED" && (task.payoutPaid ? <Badge variant="success">Paid</Badge> : <Badge variant="info">Payout due</Badge>)}
                      </div>
                      <p className="text-base font-semibold text-white">{task.title}</p>
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin size={13} /> {task.address}</p>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Clock size={12} /> Deadline {new Date(task.deadline).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                        <span className="inline-flex items-center gap-1"><IndianRupee size={12} /> {task.payoutAmount}</span>
                        <span className="inline-flex items-center gap-1"><FileText size={12} /> {task.documents?.length ?? 0} docs</span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {task.status === "COMPLETED" && !task.payoutPaid ? (
                        <Button size="sm" variant="primary" disabled={payingId === task._id} onClick={() => markPaid(task._id)}>
                          {payingId === task._id ? "Saving…" : "Mark ₹500 paid"}
                        </Button>
                      ) : task.status === "COMPLETED" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 size={14} /> Paid</span>
                      ) : null}
                    </div>
                  </div>
                  {task.status === "COMPLETED" && task.documents?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">
                      {task.documents.map((doc, i) => (
                        <a key={i} href={doc.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-sky-300 hover:bg-white/10">
                          <FileText size={12} /> {doc.label || `Document ${i + 1}`}
                        </a>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
