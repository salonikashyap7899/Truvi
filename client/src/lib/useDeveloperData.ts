import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSocketEvent } from "@/lib/socket";
import { avgUnitPrice } from "@/lib/devIntel";
import type { Lead, Project, SiteVisit, Unit } from "@/types";

export interface DeveloperProjectLeadEntry {
  label: string;
  kind: "BUYER_CRM" | "REFERRAL";
  status: string;
  source: string;
  campaign?: string | null;
  ad?: string | null;
  budgetRange?: string | null;
  propertyType?: string | null;
  preferredLocation?: string | null;
  plotSize?: string | null;
  purchasePurpose?: string | null;
  purchaseTimeline?: string | null;
  contactDetailsVisible: boolean;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  createdAt: string;
}

export interface DeveloperProjectLeadSummary {
  projectId: string;
  projectName: string;
  total: number;
  detailsEnabled: boolean;
  entries: DeveloperProjectLeadEntry[];
}

export interface DeveloperData {
  projects: Project[];
  units: Unit[];
  unitsByProject: Record<string, Unit[]>;
  leads: Lead[];
  projectLeadSummaries: DeveloperProjectLeadSummary[];
  siteVisits: SiteVisit[];
  /** Average unit price per projectId — used to price leads/pipeline. */
  avgPriceByProject: Record<string, number>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads everything the Developer OS pages render from — projects, their units,
 * leads and site visits — and derives the per-project average price used across
 * the intelligence layer. Auto-refreshes on live unit/lead socket events so the
 * developer and CPs always see the same live data.
 */
export function useDeveloperData(): DeveloperData {
  const [projects, setProjects] = useState<Project[]>([]);
  const [unitsByProject, setUnitsByProject] = useState<Record<string, Unit[]>>({});
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projectLeadSummaries, setProjectLeadSummaries] = useState<DeveloperProjectLeadSummary[]>([]);
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Each source is caught independently — one failing endpoint never blanks
      // the whole dashboard (projects still show if leads fail, and vice-versa).
      const [projectsRes, leadsRes, visitsRes, leadSummaryRes] = await Promise.all([
        api.get("/projects").catch(() => ({ data: { projects: [] } })),
        api.get("/leads").catch(() => ({ data: { leads: [] } })),
        api.get("/site-visits").catch(() => ({ data: { siteVisits: [] } })),
        api.get("/projects/lead-summary").catch(() => ({ data: { projects: [] } })),
      ]);
      const projectList: Project[] = projectsRes.data.projects ?? [];
      setProjects(projectList);
      setLeads(leadsRes.data.leads ?? []);
      setSiteVisits(visitsRes.data.siteVisits ?? []);
      setProjectLeadSummaries(leadSummaryRes.data.projects ?? []);

      const unitLists = await Promise.all(
        projectList.map((p) =>
          api.get("/units", { params: { projectId: p._id } }).catch(() => ({ data: { units: [] } })),
        ),
      );
      const map: Record<string, Unit[]> = {};
      projectList.forEach((p, i) => (map[p._id] = unitLists[i].data.units ?? []));
      setUnitsByProject(map);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent("unit:update", () => load());
  useSocketEvent("lead:update", () => load());
  useSocketEvent("buyer-crm:project-leads:update", () => load());

  const units = Object.values(unitsByProject).flat();
  const avgPriceByProject: Record<string, number> = {};
  for (const p of projects) avgPriceByProject[p._id] = avgUnitPrice(unitsByProject[p._id] ?? [], p);

  return { projects, units, unitsByProject, leads, projectLeadSummaries, siteVisits, avgPriceByProject, loading, error, reload: load };
}
