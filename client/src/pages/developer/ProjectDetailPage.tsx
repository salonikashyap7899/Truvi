import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, Badge, Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";
import { useSocketEvent } from "@/lib/socket";
import { toast } from "sonner";
import TrustScoreWidget, { mockScoreFromId } from "@/components/TrustScoreWidget";
import LegalRiskCard, { mockRiskFromId } from "@/components/LegalRiskCard";
import type { Project, Unit, Lead } from "@/types";

const STATUS_VARIANT: Record<string, "success" | "warning" | "info" | "danger"> = {
  AVAILABLE: "success",
  LOCKED: "warning",
  RESERVED: "info",
  SOLD: "danger",
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [unitForm, setUnitForm] = useState({ unitNumber: "", type: "", areaSqft: "", price: "" });
  const [uploading, setUploading] = useState(false);

  async function load() {
    const [projectRes, leadsRes] = await Promise.all([
      api.get(`/projects/${id}`),
      api.get("/leads", { params: { projectId: id } }),
    ]);
    setProject(projectRes.data.project);
    setUnits(projectRes.data.units);
    setLeads(leadsRes.data.leads);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Real-time: a CP locking a unit anywhere reflects here instantly.
  useSocketEvent<{ projectId: string; unit: Unit }>("unit:update", (payload) => {
    if (payload.projectId !== id) return;
    setUnits((prev) => {
      const exists = prev.some((u) => u._id === payload.unit._id);
      return exists ? prev.map((u) => (u._id === payload.unit._id ? payload.unit : u)) : [...prev, payload.unit];
    });
  });

  async function addUnit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/units", {
        projectId: id,
        unitNumber: unitForm.unitNumber,
        type: unitForm.type,
        areaSqft: Number(unitForm.areaSqft),
        price: Number(unitForm.price),
      });
      toast.success("Unit added");
      setUnitForm({ unitNumber: "", type: "", areaSqft: "", price: "" });
      setShowAddUnit(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to add unit");
    }
  }

  async function uploadBrochure(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await api.post("/uploads", formData, { headers: { "Content-Type": "multipart/form-data" } });
      await api.patch(`/projects/${id}`, { brochureUrl: uploadRes.data.url });
      toast.success("Brochure uploaded and linked to this project");
      load();
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (!project) return <div className="min-h-screen bg-[#0B1220] p-10 text-white">Loading…</div>;

  const trustScore = project.trustScore ?? mockScoreFromId(project._id);
  const legalRisk = project.legalRiskLevel ?? mockRiskFromId(project._id);

  return (
    <main className="min-h-screen bg-[#0B1220] p-6 text-white md:p-10">
      <h1 className="text-2xl font-semibold">{project.name}</h1>
      <p className="mt-1 text-sm text-neutral-400">
        {project.location}, {project.city} · <Badge variant={project.approvalStatus === "APPROVED" ? "success" : "warning"}>{project.approvalStatus}</Badge>
      </p>

      <div className="mt-6 flex flex-wrap gap-4">
        <TrustScoreWidget score={trustScore} />
        <div className="w-full sm:w-72">
          <LegalRiskCard level={legalRisk} />
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Brochure / price list</h2>
        <label className="mt-2 inline-block cursor-pointer rounded-lg border border-neutral-700 bg-[#121A2B] px-4 py-2 text-sm hover:border-blue-600">
          {uploading ? "Uploading…" : "Upload PDF"}
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => e.target.files?.[0] && uploadBrochure(e.target.files[0])}
          />
        </label>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Add a unit</h2>
        {!showAddUnit ? (
          <Button size="sm" className="mt-2" onClick={() => setShowAddUnit(true)}>+ Add unit</Button>
        ) : (
          <form onSubmit={addUnit} className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-neutral-800 bg-[#121A2B] p-4 sm:grid-cols-5">
            <div>
              <Label className="text-neutral-300">Unit #</Label>
              <Input required value={unitForm.unitNumber} onChange={(e) => setUnitForm({ ...unitForm, unitNumber: e.target.value })} className="border-neutral-700 bg-neutral-900 text-white" />
            </div>
            <div>
              <Label className="text-neutral-300">Type</Label>
              <Input required placeholder="2BHK" value={unitForm.type} onChange={(e) => setUnitForm({ ...unitForm, type: e.target.value })} className="border-neutral-700 bg-neutral-900 text-white" />
            </div>
            <div>
              <Label className="text-neutral-300">Area (sqft)</Label>
              <Input required type="number" value={unitForm.areaSqft} onChange={(e) => setUnitForm({ ...unitForm, areaSqft: e.target.value })} className="border-neutral-700 bg-neutral-900 text-white" />
            </div>
            <div>
              <Label className="text-neutral-300">Price (₹)</Label>
              <Input required type="number" value={unitForm.price} onChange={(e) => setUnitForm({ ...unitForm, price: e.target.value })} className="border-neutral-700 bg-neutral-900 text-white" />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" size="sm">Add</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowAddUnit(false)}>Cancel</Button>
            </div>
          </form>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Inventory ({units.length} units) <span className="text-xs text-neutral-500">— live, updates in real time</span></h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-[#121A2B] text-neutral-400">
              <tr>
                <th className="p-3 text-left">Unit</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Area (sqft)</th>
                <th className="p-3 text-left">Price</th>
                <th className="p-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u._id} className="border-t border-neutral-800">
                  <td className="p-3">{u.unitNumber}</td>
                  <td className="p-3">{u.type}</td>
                  <td className="p-3">{u.areaSqft}</td>
                  <td className="p-3">{formatINR(u.price)}</td>
                  <td className="p-3"><Badge variant={STATUS_VARIANT[u.status]}>{u.status}</Badge></td>
                </tr>
              ))}
              {units.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-neutral-500">No units added yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Leads ({leads.length})</h2>
        <div className="mt-3 space-y-2">
          {leads.map((l) => (
            <Card key={l._id} className="flex items-center justify-between border-neutral-800 bg-[#121A2B] text-white">
              <div>
                <p className="font-medium">{l.clientName}</p>
                <p className="text-sm text-neutral-400">{l.clientPhone}</p>
              </div>
              <Badge variant="info">{l.stage}</Badge>
            </Card>
          ))}
          {leads.length === 0 && <p className="text-sm text-neutral-500">No leads yet.</p>}
        </div>
      </section>
    </main>
  );
}
