import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Clock3, FileSearch, Filter, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type RequirementStatus = "ACTIVE" | "CLOSED" | "UNDER_REVIEW" | "REJECTED" | "SPAM";
interface Requirement {
  _id: string;
  title: string;
  requirementKind: "BUYER" | "CLIENT";
  submittedByRole: string;
  visibility: "PRIVATE" | "TRUVI";
  propertyType: string;
  city: string;
  location: string;
  minBudget: number | null;
  maxBudget: number;
  minAreaSqft: number | null;
  maxAreaSqft: number | null;
  timeline: string;
  details?: string | null;
  publicSummary?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  contactConsent: boolean;
  status: RequirementStatus;
  moderationNote?: string | null;
  duplicateOfId?: string | null;
  createdAt: string;
  moderatedAt?: string | null;
}
interface AdminRequirementRow {
  requirement: Requirement;
  submitter: { id: string; name: string; email: string; role: string };
}
interface Analytics {
  requirements: { total: number; active: number; closed: number; underReview: number; rejected: number; spam: number; activeWithMatches: number; activeWithoutMatches: number };
  matches: { total: number; distinctMatchedRequirements: number; notificationQueued: number; emailsAcceptedBySmtp: number; emailsConfirmedDelivered: number; failures: number };
  propertyEnquiriesFromNotifications: { tracked: boolean; count: number | null };
  note: string;
}
interface EventRecord {
  _id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorUserId: string | null;
}
interface DuplicateGroup {
  key: string;
  requirements: Array<{ id: string; title: string; city: string; location: string; propertyType: string; maxBudget: number; createdAt: string; submittedByRole: string; minBudget: number | null }>;
}

const STATUS_OPTIONS: RequirementStatus[] = ["ACTIVE", "UNDER_REVIEW", "CLOSED", "REJECTED", "SPAM"];
const formatMoney = (value: number | null | undefined) => value == null
  ? "—"
  : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

export default function AdminRequirementsPage() {
  const [rows, setRows] = useState<AdminRequirementRow[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [events, setEvents] = useState<Record<string, EventRecord[]>>({});
  const [expandedEvents, setExpandedEvents] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 0 });
  const [statusDrafts, setStatusDrafts] = useState<Record<string, RequirementStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [duplicateTargets, setDuplicateTargets] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [retryingEmails, setRetryingEmails] = useState(false);
  const [analyticsDraft, setAnalyticsDraft] = useState({ dateFrom: "", dateTo: "", city: "", location: "", propertyType: "ALL", sourceRole: "ALL", status: "ALL" });
  const [analyticsFilters, setAnalyticsFilters] = useState({ dateFrom: "", dateTo: "", city: "", location: "", propertyType: "ALL", sourceRole: "ALL", status: "ALL" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, analyticsRes, duplicateRes] = await Promise.all([
        api.get("/requirements/admin", {
          params: {
            page,
            limit: 30,
            q: query.trim() || undefined,
            status: statusFilter !== "ALL" ? statusFilter : undefined,
            role: roleFilter !== "ALL" ? roleFilter : undefined,
          },
        }),
        api.get("/requirements/admin/analytics", {
          params: {
            dateFrom: analyticsFilters.dateFrom || undefined,
            dateTo: analyticsFilters.dateTo || undefined,
            city: analyticsFilters.city.trim() || undefined,
            location: analyticsFilters.location.trim() || undefined,
            propertyType: analyticsFilters.propertyType !== "ALL" ? analyticsFilters.propertyType : undefined,
            role: analyticsFilters.sourceRole !== "ALL" ? analyticsFilters.sourceRole : undefined,
            status: analyticsFilters.status !== "ALL" ? analyticsFilters.status : "ALL",
          },
        }),
        api.get("/requirements/admin/duplicates"),
      ]);
      setRows((listRes.data.requirements ?? []) as AdminRequirementRow[]);
      setPagination(listRes.data.pagination ?? { page: 1, limit: 30, total: 0, totalPages: 0 });
      setAnalytics((analyticsRes.data ?? null) as Analytics | null);
      setDuplicates((duplicateRes.data.candidateGroups ?? []) as DuplicateGroup[]);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not load requirement operations.");
    } finally {
      setLoading(false);
    }
  }, [page, query, statusFilter, roleFilter, analyticsFilters]);

  useEffect(() => { void load(); }, [load]);

  async function retryFailedEmails() {
    setRetryingEmails(true);
    try {
      const response = await api.post("/requirements/admin/retry-failed-emails");
      toast.success(`${response.data.resetCount ?? 0} failed email(s) queued for retry.`);
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not retry failed email notifications.");
    } finally {
      setRetryingEmails(false);
    }
  }

  async function moderate(row: Requirement) {
    setBusyId(row._id);
    try {
      const duplicateOfId = duplicateTargets[row._id]?.trim() || null;
      await api.patch(`/requirements/admin/${row._id}`, {
        status: statusDrafts[row._id] ?? row.status,
        moderationNote: notes[row._id]?.trim() || null,
        duplicateOfId,
      });
      toast.success("Requirement moderation saved and audit logged.");
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not moderate requirement.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleEvents(id: string) {
    if (expandedEvents === id) {
      setExpandedEvents(null);
      return;
    }
    setExpandedEvents(id);
    if (events[id]) return;
    try {
      const response = await api.get(`/requirements/admin/${id}/events`);
      setEvents((current) => ({ ...current, [id]: (response.data.events ?? []) as EventRecord[] }));
    } catch {
      toast.error("Could not load requirement history.");
    }
  }

  const kpis = analytics ? [
    { label: "All requirements", value: analytics.requirements.total, description: "Actual database records" },
    { label: "Active", value: analytics.requirements.active, description: "Currently open requests" },
    { label: "Active with matches", value: analytics.requirements.activeWithMatches, description: "Has at least one eligible match" },
    { label: "No active match", value: analytics.requirements.activeWithoutMatches, description: "Can match future inventory" },
    { label: "Queued / retrying", value: analytics.matches.notificationQueued, description: "Match notification work" },
    { label: "SMTP accepted", value: analytics.matches.emailsAcceptedBySmtp, description: "Not proof of inbox delivery" },
    { label: "Confirmed delivered", value: analytics.matches.emailsConfirmedDelivered, description: "Provider-confirmed only" },
    { label: "Delivery failures", value: analytics.matches.failures, description: "Failed notification or email rows" },
  ] : [];

  return (
    <main className="min-h-screen px-4 py-7 pb-28 text-white sm:px-6 md:px-10">
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Truvi operations</p>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold sm:text-3xl"><ShieldCheck size={26} /> Requirement moderation</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Review requirement quality, identify possible duplicates, inspect activity history, and monitor real matching and email queue status. Private client data appears only in this admin-protected view.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> Refresh</Button>
            <Button variant="outline" size="sm" onClick={() => void retryFailedEmails()} disabled={retryingEmails}><RefreshCw size={14} /> {retryingEmails ? "Queueing..." : "Retry failed emails"}</Button>
            <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-teal-300 hover:text-teal-200"><ArrowLeft size={15} /> Admin dashboard</Link>
          </div>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold">Analytics filters</h2>
              <p className="mt-1 text-xs text-muted-foreground">The KPI cards below use the same database filters; date boundaries use server timestamps.</p>
            </div>
            <Button type="button" size="sm" onClick={() => setAnalyticsFilters({ ...analyticsDraft })} disabled={loading}><Filter size={14} /> Apply filters</Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs text-muted-foreground">From date
              <input type="date" value={analyticsDraft.dateFrom} onChange={(event) => setAnalyticsDraft((current) => ({ ...current, dateFrom: event.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#111820] px-3 py-2 text-sm text-white" />
            </label>
            <label className="block text-xs text-muted-foreground">To date
              <input type="date" value={analyticsDraft.dateTo} onChange={(event) => setAnalyticsDraft((current) => ({ ...current, dateTo: event.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#111820] px-3 py-2 text-sm text-white" />
            </label>
            <label className="block text-xs text-muted-foreground">City
              <input value={analyticsDraft.city} onChange={(event) => setAnalyticsDraft((current) => ({ ...current, city: event.target.value }))} placeholder="All cities" className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" />
            </label>
            <label className="block text-xs text-muted-foreground">Locality
              <input value={analyticsDraft.location} onChange={(event) => setAnalyticsDraft((current) => ({ ...current, location: event.target.value }))} placeholder="All localities" className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" />
            </label>
            <label className="block text-xs text-muted-foreground">Property type
              <select value={analyticsDraft.propertyType} onChange={(event) => setAnalyticsDraft((current) => ({ ...current, propertyType: event.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#111820] px-3 py-2 text-sm text-white">
                <option value="ALL">All types</option>
                {["PLOTTED", "RESIDENTIAL", "APARTMENT", "VILLA", "COMMERCIAL", "INDUSTRIAL", "LAND", "MIXED"].map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">Requirement source role
              <select value={analyticsDraft.sourceRole} onChange={(event) => setAnalyticsDraft((current) => ({ ...current, sourceRole: event.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#111820] px-3 py-2 text-sm text-white">
                <option value="ALL">All roles</option>
                {["BUYER", "CP", "DEVELOPER", "AMBASSADOR", "EMPLOYEE", "ADMIN"].map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">Requirement status
              <select value={analyticsDraft.status} onChange={(event) => setAnalyticsDraft((current) => ({ ...current, status: event.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#111820] px-3 py-2 text-sm text-white">
                <option value="ALL">All statuses</option>
                {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((item) => (
            <article key={item.label} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{item.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
            </article>
          ))}
        </section>

        {analytics && (
          <section className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <h2 className="font-medium">Requirement status breakdown</h2>
              <p className="mt-2 text-sm text-muted-foreground">Closed: {analytics.requirements.closed} · Under review: {analytics.requirements.underReview} · Rejected: {analytics.requirements.rejected} · Spam: {analytics.requirements.spam}</p>
            </div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
              <h2 className="flex items-center gap-2 font-medium text-amber-100"><AlertTriangle size={16} /> Measurement limitation</h2>
              <p className="mt-2 text-sm leading-5 text-white/70">{analytics.note}</p>
              <p className="mt-2 text-sm">Enquiries attributed to notifications: <strong>{analytics.propertyEnquiriesFromNotifications.tracked ? analytics.propertyEnquiriesFromNotifications.count : "Not instrumented"}</strong></p>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-6">
          <div className="flex items-center gap-2"><FileSearch size={19} className="text-teal-300" /><h2 className="text-lg font-semibold">Requirement review queue</h2></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3">
              <Filter size={15} className="text-muted-foreground" />
              <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search title/city/locality" className="min-w-0 bg-transparent py-2.5 text-sm outline-none" />
            </label>
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="rounded-xl border border-white/10 bg-[#111820] px-3 py-2.5 text-sm">
              <option value="ALL">All statuses</option>
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}
            </select>
            <select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }} className="rounded-xl border border-white/10 bg-[#111820] px-3 py-2.5 text-sm">
              <option value="ALL">All submitter roles</option>
              {["BUYER", "CP", "DEVELOPER", "AMBASSADOR", "ADMIN"].map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
            <div className="flex items-center justify-end text-xs text-muted-foreground">{pagination.total} records · page {pagination.page} of {Math.max(1, pagination.totalPages)}</div>
          </div>

          <div className="mt-4 space-y-3">
            {rows.map(({ requirement: row, submitter }) => (
              <article key={row._id} className="rounded-xl border border-white/10 bg-black/15 p-4">
                <div className="flex flex-col justify-between gap-3 lg:flex-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-teal-400/10 px-2.5 py-1 text-[11px] text-teal-200">{row.status.replace(/_/g, " ")}</span>
                      <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/60">{row.visibility}</span>
                      <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/60">{row.requirementKind}</span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold">{row.title}</h3>
                    <p className="mt-1 text-sm text-white/75">{row.propertyType} · {row.location}, {row.city}</p>
                    <p className="mt-1 text-sm text-white/75">{formatMoney(row.minBudget)} – {formatMoney(row.maxBudget)} · {row.minAreaSqft ?? "Any"}–{row.maxAreaSqft ?? "Any"} sq. ft. · {row.timeline.replace(/_/g, " ")}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Submitted by {submitter.name} ({submitter.role}) · {submitter.email} · {new Date(row.createdAt).toLocaleString("en-IN")}</p>
                    {row.publicSummary && <p className="mt-3 rounded-lg bg-white/[0.04] p-3 text-sm text-white/70">{row.publicSummary}</p>}
                    {row.details && <p className="mt-2 text-sm leading-5 text-white/65">Private details: {row.details}</p>}
                    {(row.clientName || row.clientPhone || row.clientEmail) && (
                      <div className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-3 text-sm">
                        <p className="font-medium text-amber-100">Private client information · consent {row.contactConsent ? "recorded" : "missing"}</p>
                        <p className="mt-1 text-white/70">{row.clientName || "No name"} · {row.clientPhone || "No phone"} · {row.clientEmail || "No email"}</p>
                      </div>
                    )}
                    {row.moderationNote && <p className="mt-2 text-xs text-amber-200">Moderator note: {row.moderationNote}</p>}
                  </div>

                  <div className="w-full space-y-2 lg:max-w-xs">
                    <label className="block text-xs text-muted-foreground">
                      Status
                      <select value={statusDrafts[row._id] ?? row.status} onChange={(event) => setStatusDrafts((current) => ({ ...current, [row._id]: event.target.value as RequirementStatus }))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#111820] px-3 py-2 text-sm text-white">
                        {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}
                      </select>
                    </label>
                    <label className="block text-xs text-muted-foreground">
                      Moderation note
                      <input value={notes[row._id] ?? row.moderationNote ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [row._id]: event.target.value }))} maxLength={500} placeholder="Reason or moderation note" className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" />
                    </label>
                    <label className="block text-xs text-muted-foreground">
                      Duplicate of requirement ID (optional)
                      <input value={duplicateTargets[row._id] ?? row.duplicateOfId ?? ""} onChange={(event) => setDuplicateTargets((current) => ({ ...current, [row._id]: event.target.value }))} placeholder="UUID of duplicate target" className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white" />
                    </label>
                    <Button type="button" size="sm" onClick={() => void moderate(row)} disabled={busyId === row._id} className="w-full">{busyId === row._id ? "Saving..." : "Save moderation"}</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void toggleEvents(row._id)} className="w-full"><Clock3 size={14} /> {expandedEvents === row._id ? "Hide history" : "View activity history"}</Button>
                  </div>
                </div>

                {expandedEvents === row._id && (
                  <div className="mt-4 border-t border-white/10 pt-3">
                    <h4 className="text-sm font-medium">Activity history</h4>
                    {(events[row._id] ?? []).length === 0
                      ? <p className="mt-2 text-xs text-muted-foreground">No recorded events, or loading failed.</p>
                      : <ul className="mt-2 space-y-2">{events[row._id].map((event) => (
                        <li key={event._id} className="rounded-lg bg-white/[0.035] p-3">
                          <p className="text-sm">{event.action.replace(/_/g, " ")}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString("en-IN")} · actor {event.actorUserId || "system"}</p>
                        </li>
                      ))}</ul>}
                  </div>
                )}
              </article>
            ))}
            {rows.length === 0 && <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">{loading ? "Loading requirement records..." : "No requirements match these filters."}</div>}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
            <Button type="button" variant="outline" size="sm" disabled={page >= pagination.totalPages || loading || pagination.totalPages === 0} onClick={() => setPage((value) => value + 1)}>Next</Button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-6">
          <div className="flex items-center gap-2"><AlertTriangle size={19} className="text-amber-300" /><h2 className="text-lg font-semibold">Possible duplicate requirements</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">Candidate groups share normalized city/locality/property type and overlapping budget ranges. Review manually before marking any record as a duplicate.</p>
          <div className="mt-4 space-y-3">
            {duplicates.map((group, index) => (
              <article key={group.key} className="rounded-xl border border-white/10 p-4">
                <p className="text-xs text-muted-foreground">Candidate group {index + 1}</p>
                <ul className="mt-2 space-y-2">{group.requirements.map((row) => (
                  <li key={row.id} className="flex flex-col justify-between gap-1 sm:flex-row">
                    <span className="text-sm font-medium">{row.title} <span className="font-normal text-white/50">({row.submittedByRole})</span></span>
                    <span className="text-xs text-muted-foreground">{row.location}, {row.city} · {formatMoney(row.minBudget)}–{formatMoney(row.maxBudget)} · <span className="select-all">{row.id}</span></span>
                  </li>
                ))}</ul>
              </article>
            ))}
            {duplicates.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-muted-foreground">No candidate groups detected in the most recent 1,500 active requirements.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
