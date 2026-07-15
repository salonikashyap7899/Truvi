import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, LayoutGrid } from "lucide-react";
import { formatINR } from "@/lib/utils";

interface ManagedUnit {
  _id: string;
  unitNumber: string;
  type: string;
  areaSqft: number;
  price: number;
  status: "AVAILABLE" | "LOCKED" | "RESERVED" | "SOLD";
}

const STATUS_CLS: Record<ManagedUnit["status"], string> = {
  AVAILABLE: "text-green-300",
  LOCKED: "text-amber-300",
  RESERVED: "text-sky-300",
  SOLD: "text-muted-foreground",
};

export default function UnitsManager({ projectId }: { projectId: string }) {
  const [units, setUnits] = useState<ManagedUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [unitNumber, setUnitNumber] = useState("");
  const [type, setType] = useState("");
  const [areaSqft, setAreaSqft] = useState("");
  const [price, setPrice] = useState("");

  async function load() {
    try {
      const res = await api.get("/units", { params: { projectId } });
      setUnits(res.data.units);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load plots");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function addUnit(e: React.FormEvent) {
    e.preventDefault();
    const areaNum = Number(areaSqft);
    const priceNum = Number(price);
    if (!unitNumber.trim() || !type.trim() || !(areaNum > 0) || !(priceNum > 0)) {
      toast.error("Fill plot number, type, a positive area and price");
      return;
    }
    setAdding(true);
    try {
      const res = await api.post("/units", {
        projectId,
        unitNumber: unitNumber.trim(),
        type: type.trim(),
        areaSqft: areaNum,
        price: priceNum,
      });
      setUnits((prev) => [...prev, res.data.unit].sort((a, b) => a.unitNumber.localeCompare(b.unitNumber)));
      setUnitNumber("");
      setType("");
      setAreaSqft("");
      setPrice("");
      toast.success("Plot added");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to add plot");
    } finally {
      setAdding(false);
    }
  }

  async function setStatus(unit: ManagedUnit, status: "AVAILABLE" | "RESERVED" | "SOLD") {
    setBusyId(unit._id);
    try {
      const res = await api.patch(`/units/${unit._id}`, { status });
      setUnits((prev) => prev.map((u) => (u._id === unit._id ? res.data.unit : u)));
      toast.success(`${unit.unitNumber} → ${status === "RESERVED" ? "Blocked" : status.toLowerCase()}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteUnit(unit: ManagedUnit) {
    if (!confirm(`Delete plot ${unit.unitNumber}?`)) return;
    setBusyId(unit._id);
    try {
      await api.delete(`/units/${unit._id}`);
      setUnits((prev) => prev.filter((u) => u._id !== unit._id));
      toast.success("Plot deleted");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  const inputCls = "border-white/15 bg-card text-white";

  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <LayoutGrid size={17} className="text-[var(--trust)]" /> Plots & Units
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Add every plot/unit with its type, area and price. These appear on the public presentation page and power the 3D master plan.
      </p>

      {/* Add plot */}
      <form onSubmit={addUnit} className="mt-4 rounded-lg border border-white/10 glass p-4">
        <p className="mb-3 text-sm font-medium text-white">Add a plot / unit</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-foreground/90">Plot / Unit no.</Label>
            <Input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder="A-101" className={inputCls} />
          </div>
          <div>
            <Label className="text-foreground/90">Type</Label>
            <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="Plot 200 sq.yd / 3BHK" className={inputCls} />
          </div>
          <div>
            <Label className="text-foreground/90">Area (sq.ft)</Label>
            <Input type="number" min="1" value={areaSqft} onChange={(e) => setAreaSqft(e.target.value)} placeholder="1800" className={inputCls} />
          </div>
          <div>
            <Label className="text-foreground/90">Price (₹)</Label>
            <Input type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="5500000" className={inputCls} />
          </div>
        </div>
        <Button type="submit" size="sm" className="mt-3" disabled={adding}>
          {adding ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Plus size={13} className="mr-1.5" />}
          Add Plot
        </Button>
      </form>

      {/* List */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-white/10 glass">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Plot</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Area</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
            ) : units.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No plots added yet.</td></tr>
            ) : (
              units.map((u) => (
                <tr key={u._id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 font-medium text-white">{u.unitNumber}</td>
                  <td className="px-4 py-3 text-foreground/90">{u.type}</td>
                  <td className="px-4 py-3 text-foreground/90">{u.areaSqft.toLocaleString("en-IN")} sq.ft</td>
                  <td className="px-4 py-3 text-foreground/90">{formatINR(u.price)}</td>
                  <td className={`px-4 py-3 font-medium ${STATUS_CLS[u.status]}`}>{u.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {u.status !== "AVAILABLE" && (
                        <Button size="sm" variant="secondary" disabled={busyId === u._id} onClick={() => setStatus(u, "AVAILABLE")}>
                          Available
                        </Button>
                      )}
                      {u.status !== "RESERVED" && u.status !== "SOLD" && (
                        <Button size="sm" variant="secondary" disabled={busyId === u._id} onClick={() => setStatus(u, "RESERVED")}>
                          Block
                        </Button>
                      )}
                      {u.status !== "SOLD" && (
                        <Button size="sm" variant="secondary" disabled={busyId === u._id} onClick={() => setStatus(u, "SOLD")}>
                          Sold
                        </Button>
                      )}
                      <button
                        onClick={() => deleteUnit(u)}
                        disabled={busyId === u._id}
                        title="Delete plot"
                        className="text-red-400/70 hover:text-red-400"
                      >
                        {busyId === u._id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
