import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Badge, Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";
import { useSocketEvent } from "@/lib/socket";
import { toast } from "sonner";
import TrustScoreWidget from "@/components/TrustScoreWidget";
import LegalRiskCard from "@/components/LegalRiskCard";
import PriceFairnessMeter from "@/components/PriceFairnessMeter";
import NearbyAmenities from "@/components/NearbyAmenities";
import FloodRiskCard from "@/components/FloodRiskCard";
import CrimeIndexCard from "@/components/CrimeIndexCard";
import FutureAppreciationCard from "@/components/FutureAppreciationCard";
import OwnerHistoryCard from "@/components/OwnerHistoryCard";
import ReraDetailsCard from "@/components/ReraDetailsCard";
import PresentationManager from "@/components/PresentationManager";
import ProjectDetailsEditor from "@/components/ProjectDetailsEditor";
import LegalDocsManager from "@/components/LegalDocsManager";
import type { Project, Unit, Lead } from "@/types";

const STATUS_VARIANT: Record<string, "success" | "warning" | "info" | "danger"> = {
  AVAILABLE: "success",
  LOCKED: "warning",
  RESERVED: "info",
  SOLD: "danger",
};

const LEAD_STAGES: Lead["stage"][] = [
  "GENERATED", "ASSIGNED", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "BOOKING", "REGISTRATION", "LOST",
];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [unitForm, setUnitForm] = useState({ unitNumber: "", type: "", areaSqft: "", plotSize: "", price: "" });
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

  // When arriving from the "Edit" button (…/projects/:id#edit-project), scroll
  // the details editor into view once, after the project has loaded.
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (project && !scrolledRef.current && window.location.hash === "#edit-project") {
      scrolledRef.current = true;
      setTimeout(() => document.getElementById("edit-project")?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    }
  }, [project]);

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
        plotSize: unitForm.plotSize.trim() || undefined,
        price: Number(unitForm.price),
      });
      toast.success("Unit added");
      setUnitForm({ unitNumber: "", type: "", areaSqft: "", plotSize: "", price: "" });
      setShowAddUnit(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to add unit");
    }
  }

  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitEdit, setUnitEdit] = useState({ unitNumber: "", type: "", areaSqft: "", plotSize: "", price: "" });
  const [savingUnit, setSavingUnit] = useState(false);

  function startEditUnit(u: Unit) {
    setEditingUnitId(u._id);
    setUnitEdit({ unitNumber: u.unitNumber, type: u.type, areaSqft: String(u.areaSqft), plotSize: u.plotSize ?? "", price: String(u.price) });
  }

  async function saveUnitEdit(u: Unit) {
    const areaNum = Number(unitEdit.areaSqft);
    const priceNum = Number(unitEdit.price);
    if (!unitEdit.unitNumber.trim() || !unitEdit.type.trim() || !(areaNum > 0) || !(priceNum > 0)) {
      toast.error("Fill unit no., type, a positive area and price");
      return;
    }
    setSavingUnit(true);
    try {
      const res = await api.patch(`/units/${u._id}`, {
        unitNumber: unitEdit.unitNumber.trim(),
        type: unitEdit.type.trim(),
        areaSqft: areaNum,
        plotSize: unitEdit.plotSize.trim() || null,
        price: priceNum,
      });
      setUnits((prev) => prev.map((x) => (x._id === u._id ? res.data.unit : x)));
      setEditingUnitId(null);
      toast.success("Unit updated");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to update unit");
    } finally {
      setSavingUnit(false);
    }
  }

  async function setUnitStatus(unit: Unit, status: "AVAILABLE" | "RESERVED" | "SOLD") {
    try {
      const res = await api.patch(`/units/${unit._id}`, { status });
      setUnits((prev) => prev.map((u) => (u._id === unit._id ? res.data.unit : u)));
      toast.success(
        `${unit.unitNumber} → ${status === "RESERVED" ? "Blocked" : status === "AVAILABLE" ? "Available" : "Sold"}`
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to update unit");
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

  if (!project) return <div className="min-h-screen p-10 text-white">Loading…</div>;

  const trustScore = project.trustScore ?? null;
  const legalRisk = project.legalRiskLevel ?? null;
  const floodRisk = project.floodRiskLevel ?? null;
  const crimeIndex = project.crimeIndexLevel ?? null;
  const ownerHistory = project.ownerHistory ?? [];
  const reraInfo = {
    reraNumber: project.reraNumber ?? "",
    reraStatus: project.reraStatus ?? ("NOT_REGISTERED" as const),
    reraValidityDate: project.reraValidityDate ?? null,
  };

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      <h1 className="text-2xl font-semibold">{project.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {project.location}, {project.city} · <Badge variant={project.approvalStatus === "APPROVED" ? "success" : "warning"}>{project.approvalStatus}</Badge>
      </p>

      <div className="mt-6 flex flex-wrap gap-4">
        <TrustScoreWidget score={trustScore} />
        <div className="w-full sm:w-72">
          <LegalRiskCard level={legalRisk} />
        </div>
        <div className="w-full sm:w-72">
          <FloodRiskCard level={floodRisk} />
        </div>
        <div className="w-full sm:w-72">
          <CrimeIndexCard level={crimeIndex} />
        </div>
        <div className="w-full sm:max-w-lg">
          <PriceFairnessMeter projectId={project._id} />
        </div>
        <div className="w-full sm:max-w-lg">
          <FutureAppreciationCard projectId={project._id} forecast={project.appreciationForecast} />
        </div>
        <div className="w-full sm:w-72">
          <OwnerHistoryCard owners={ownerHistory} />
        </div>
        <div className="w-full sm:w-72">
          <ReraDetailsCard info={reraInfo} />
        </div>
      </div>

      <div className="mt-6">
        <NearbyAmenities
          projectId={project._id}
          amenities={project.presentationInfo?.nearbyAmenities}
          editable
          onSaved={(nearbyAmenities) =>
            setProject((p) => (p ? { ...p, presentationInfo: { ...(p.presentationInfo ?? {}), nearbyAmenities } } : p))
          }
        />
      </div>

      {/* Editable commercial details: name/location/RERA/possession/contact/payment plans */}
      <div id="edit-project">
        <ProjectDetailsEditor project={project} onUpdated={setProject} />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Brochure / price list</h2>
        <label className="mt-2 inline-block cursor-pointer rounded-lg border border-white/15 glass px-4 py-2 text-sm hover:border-blue-600">
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

      <PresentationManager project={project} onProjectUpdated={setProject} />

      <LegalDocsManager projectId={project._id} />

      <section className="mt-8">
        <h2 className="text-lg font-medium">Add a unit</h2>
        {!showAddUnit ? (
          <Button size="sm" className="mt-2" onClick={() => setShowAddUnit(true)}>+ Add unit</Button>
        ) : (
          <form onSubmit={addUnit} className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-white/10 glass p-4 sm:grid-cols-6">
            <div>
              <Label className="text-foreground/90">Unit #</Label>
              <Input required value={unitForm.unitNumber} onChange={(e) => setUnitForm({ ...unitForm, unitNumber: e.target.value })} className="border-white/15 bg-card text-white" />
            </div>
            <div>
              <Label className="text-foreground/90">Type</Label>
              <Input required placeholder="2BHK" value={unitForm.type} onChange={(e) => setUnitForm({ ...unitForm, type: e.target.value })} className="border-white/15 bg-card text-white" />
            </div>
            <div>
              <Label className="text-foreground/90">Area (sqft)</Label>
              <Input required type="number" value={unitForm.areaSqft} onChange={(e) => setUnitForm({ ...unitForm, areaSqft: e.target.value })} className="border-white/15 bg-card text-white" />
            </div>
            <div>
              <Label className="text-foreground/90">Plot size</Label>
              <Input placeholder="30×40 ft / 200 sq.yd" value={unitForm.plotSize} onChange={(e) => setUnitForm({ ...unitForm, plotSize: e.target.value })} className="border-white/15 bg-card text-white" />
            </div>
            <div>
              <Label className="text-foreground/90">Price (₹)</Label>
              <Input required type="number" value={unitForm.price} onChange={(e) => setUnitForm({ ...unitForm, price: e.target.value })} className="border-white/15 bg-card text-white" />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" size="sm">Add</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowAddUnit(false)}>Cancel</Button>
            </div>
          </form>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Inventory ({units.length} units) <span className="text-xs text-muted-foreground">— live, updates in real time</span></h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="glass text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Unit</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Area (sqft)</th>
                <th className="p-3 text-left">Plot size</th>
                <th className="p-3 text-left">Price</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-right">Availability</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                editingUnitId === u._id ? (
                  <tr key={u._id} className="border-t border-white/10 bg-white/[0.02]">
                    <td className="p-2"><Input value={unitEdit.unitNumber} onChange={(e) => setUnitEdit({ ...unitEdit, unitNumber: e.target.value })} className="h-8 border-white/15 bg-card text-white" /></td>
                    <td className="p-2"><Input value={unitEdit.type} onChange={(e) => setUnitEdit({ ...unitEdit, type: e.target.value })} className="h-8 border-white/15 bg-card text-white" /></td>
                    <td className="p-2"><Input type="number" value={unitEdit.areaSqft} onChange={(e) => setUnitEdit({ ...unitEdit, areaSqft: e.target.value })} className="h-8 border-white/15 bg-card text-white" /></td>
                    <td className="p-2"><Input value={unitEdit.plotSize} onChange={(e) => setUnitEdit({ ...unitEdit, plotSize: e.target.value })} placeholder="30×40 ft" className="h-8 border-white/15 bg-card text-white" /></td>
                    <td className="p-2"><Input type="number" value={unitEdit.price} onChange={(e) => setUnitEdit({ ...unitEdit, price: e.target.value })} className="h-8 border-white/15 bg-card text-white" /></td>
                    <td className="p-3"><Badge variant={STATUS_VARIANT[u.status]}>{u.status === "RESERVED" ? "BLOCKED" : u.status}</Badge></td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => saveUnitEdit(u)} disabled={savingUnit} className="rounded-full border border-emerald-700/60 px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-900/20 disabled:opacity-50">
                          {savingUnit ? "Saving…" : "Save"}
                        </button>
                        <button onClick={() => setEditingUnitId(null)} disabled={savingUnit} className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-white">
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                <tr key={u._id} className="border-t border-white/10">
                  <td className="p-3">{u.unitNumber}</td>
                  <td className="p-3">{u.type}</td>
                  <td className="p-3">{u.areaSqft}</td>
                  <td className="p-3">{u.plotSize || "—"}</td>
                  <td className="p-3">{formatINR(u.price)}</td>
                  <td className="p-3"><Badge variant={STATUS_VARIANT[u.status]}>{u.status === "RESERVED" ? "BLOCKED" : u.status}</Badge></td>
                  <td className="p-3">
                    {u.status === "LOCKED" ? (
                      <span className="flex justify-end text-xs text-muted-foreground">CP locked</span>
                    ) : (
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => startEditUnit(u)} className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-medium text-sky-300 hover:bg-white/5">
                          Edit
                        </button>
                        {u.status !== "AVAILABLE" && (
                          <button onClick={() => setUnitStatus(u, "AVAILABLE")} className="rounded-full border border-green-700/60 px-2.5 py-1 text-[11px] font-medium text-green-300 hover:bg-green-900/20">
                            Available
                          </button>
                        )}
                        {u.status !== "RESERVED" && u.status !== "SOLD" && (
                          <button onClick={() => setUnitStatus(u, "RESERVED")} className="rounded-full border border-sky-700/60 px-2.5 py-1 text-[11px] font-medium text-sky-300 hover:bg-sky-900/20">
                            Block
                          </button>
                        )}
                        {u.status !== "SOLD" && (
                          <button onClick={() => setUnitStatus(u, "SOLD")} className="rounded-full border border-red-700/60 px-2.5 py-1 text-[11px] font-medium text-red-300 hover:bg-red-900/20">
                            Sold
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                )
              ))}
              {units.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No units added yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Leads: aggregate counts only — individual buyer names/numbers are not exposed here. */}
      <section className="mt-10">
        <h2 className="text-lg font-medium">Leads ({leads.length})</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {LEAD_STAGES.map((stage) => {
            const count = leads.filter((l) => l.stage === stage).length;
            return (
              <div key={stage} className="rounded-lg border border-white/10 glass px-4 py-2 text-center">
                <p className="text-xs text-muted-foreground">{stage.replace(/_/g, " ")}</p>
                <p className="text-lg font-semibold">{count}</p>
              </div>
            );
          })}
        </div>
        {leads.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No leads yet.</p>}
      </section>
    </main>
  );
}
