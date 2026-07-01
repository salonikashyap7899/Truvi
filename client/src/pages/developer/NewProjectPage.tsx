import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, Input, Label, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function NewProjectPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", description: "", city: "", location: "", reraNumber: "", commissionPercent: 3 });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/projects", { ...form, commissionPercent: Number(form.commissionPercent) });
      toast.success("Project submitted for admin approval");
      navigate("/developer/dashboard");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0B1220] p-6 text-white md:p-10">
      <h1 className="text-2xl font-semibold">New Project</h1>
      <Card className="mt-6 max-w-xl border-neutral-800 bg-[#121A2B] text-white">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-neutral-300">Project name</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border-neutral-700 bg-neutral-900 text-white" />
          </div>
          <div>
            <Label className="text-neutral-300">Description</Label>
            <Textarea required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border-neutral-700 bg-neutral-900 text-white" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-neutral-300">City</Label>
              <Input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="border-neutral-700 bg-neutral-900 text-white" />
            </div>
            <div>
              <Label className="text-neutral-300">Location / Locality</Label>
              <Input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="border-neutral-700 bg-neutral-900 text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-neutral-300">RERA number</Label>
              <Input value={form.reraNumber} onChange={(e) => setForm({ ...form, reraNumber: e.target.value })} className="border-neutral-700 bg-neutral-900 text-white" />
            </div>
            <div>
              <Label className="text-neutral-300">Commission %</Label>
              <Input type="number" step="0.1" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: Number(e.target.value) })} className="border-neutral-700 bg-neutral-900 text-white" />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full">{loading ? "Submitting…" : "Submit for approval"}</Button>
        </form>
      </Card>
    </main>
  );
}
