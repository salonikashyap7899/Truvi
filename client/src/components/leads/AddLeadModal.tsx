import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CheckCircle2, Clock, Gift, Loader2, MapPin, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import type { Unit } from "@/types";
import { formatDate, formatTime, istNowTime, istToday, normalizeMobile, timeSlots, type PublicOffer } from "./inventoryLeadShared";

/**
 * Add Lead — opened from the "+" on an inventory card. The project (and the
 * unit, if picked) is attached automatically. What the form asks for depends
 * on who is adding it:
 *   Buyer       → their own account details are used; they add the visit.
 *   CP          → the customer's details; the CP account is attached.
 *   Ambassador  → the customer's details; Ambassador ID + referral attached.
 * The server re-checks everything (role, project, unit, dates, offers).
 */

interface Props {
  project: { _id: string; name: string; location?: string; city?: string };
  offer?: PublicOffer | null;
  onClose: () => void;
}

const REQUIREMENTS = ["Buy to live in", "Investment", "Plot to build a home", "Commercial use", "Rental income"];
const SLOTS = timeSlots("09:00", "19:00");

const field =
  "w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-[var(--trust)]/60";

export default function AddLeadModal({ project, offer, onClose }: Props) {
  useBodyScrollLock(true);
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const isBuyer = role === "BUYER";

  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [visitDate, setVisitDate] = useState(istToday(1));
  const [visitTime, setVisitTime] = useState("11:00");
  const [requirement, setRequirement] = useState("");
  const [notes, setNotes] = useState("");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [needsJoining, setNeedsJoining] = useState(false);
  // Bring an error / duplicate prompt into view (it sits below the fields).
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error || duplicate) alertRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error, duplicate]);
  const [done, setDone] = useState<{ leadId: string; message: string } | null>(null);

  // Units of this project for the optional "exact inventory" pick.
  useEffect(() => {
    api
      .get("/units", { params: { projectId: project._id } })
      .then((res) => setUnits((res.data.units as Unit[]).filter((u) => u.status !== "SOLD")))
      .catch(() => setUnits([]));
  }, [project._id]);

  // Ambassadors and Channel Partners see the referral code that's attached.
  useEffect(() => {
    if (role !== "AMBASSADOR" && role !== "CP") return;
    api.get("/onboarding/referral").then((res) => setReferralCode(res.data.referralCode ?? null)).catch(() => {});
  }, [role]);

  const accountPhone = normalizeMobile(user?.phone);
  const needsBuyerPhone = isBuyer && !accountPhone;
  const today = istToday();
  const slots = useMemo(
    () => (visitDate === today ? SLOTS.filter((t) => t > istNowTime()) : SLOTS),
    [visitDate, today],
  );
  useEffect(() => {
    if (slots.length && !slots.includes(visitTime)) setVisitTime(slots[0]);
  }, [slots, visitTime]);

  function validate(): string | null {
    if (!isBuyer) {
      if (name.trim().length < 2) return "Enter the customer's name";
      if (!normalizeMobile(phone)) return "Enter a valid 10-digit mobile number";
      if (email && !/^\S+@\S+\.\S+$/.test(email)) return "Enter a valid email";
    } else if (needsBuyerPhone && !normalizeMobile(phone)) {
      return "Add your 10-digit mobile number";
    }
    if (!visitDate || visitDate < today) return "Pick a site visit date (today or later)";
    if (visitDate > istToday(180)) return "Pick a date within the next 6 months";
    if (!slots.includes(visitTime)) return "Pick a preferred time";
    if (requirement.trim().length < 2) return "Add the purpose / requirement";
    return null;
  }

  async function submit(confirmDuplicate = false) {
    const problem = validate();
    setError(problem);
    if (problem) return;
    setSubmitting(true);
    try {
      const res = await api.post("/leads/from-inventory", {
        projectId: project._id,
        unitId: unitId || undefined,
        ...(isBuyer
          ? needsBuyerPhone ? { customerPhone: phone } : {}
          : { customerName: name.trim(), customerPhone: phone, customerEmail: email.trim() || undefined }),
        visitDate,
        visitTime,
        requirement: requirement.trim(),
        notes: notes.trim() || undefined,
        confirmDuplicate,
      });
      setDuplicate(null);
      setDone({ leadId: res.data.lead.leadId, message: res.data.message });
      toast.success("Lead submitted");
    } catch (err: any) {
      const data = err?.response?.data;
      if (err?.response?.status === 409 && data?.warning === "DUPLICATE_DETECTED") {
        setDuplicate(data.message);
      } else {
        setNeedsJoining(err?.response?.status === 403 && role === "CP");
        setError(data?.error || "Couldn't submit the lead. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const selectedUnit = units.find((u) => u._id === unitId);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Add lead">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#0a0d14]/97 text-white shadow-2xl backdrop-blur-xl sm:rounded-2xl">
        {/* Header — the project is attached automatically */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300/80">
              {isBuyer ? "Book a site visit" : "Add lead"}
            </p>
            <p className="truncate font-display text-sm font-semibold">{project.name}</p>
            {(project.location || project.city) && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-white/55">
                <MapPin size={11} /> {[project.location, project.city].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full border border-white/15 text-white/80 hover:bg-white/10">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">
              <CheckCircle2 size={28} />
            </span>
            <p className="mt-4 text-base font-semibold">{done.message}</p>
            <p className="mt-1.5 text-xs text-white/60">Lead ID <b className="text-white">{done.leadId}</b> · the Truvi team has been notified.</p>
            <div className="mt-6 flex w-full gap-2">
              {role === "CP" && (
                <Link to="/crm/pipeline" onClick={onClose} className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-semibold hover:bg-white/[0.06]">
                  Open my pipeline
                </Link>
              )}
              <button onClick={onClose} className="flex-1 rounded-xl bg-gradient-to-r from-[var(--trust)] to-[#2563eb] py-2.5 text-sm font-semibold">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => { e.preventDefault(); submit(false); }}
            noValidate
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {offer && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  <Gift size={14} className="mt-0.5 shrink-0 text-amber-300" />
                  <span><b>Special Offer:</b> {offer.badge}</span>
                </div>
              )}

              {/* Inventory */}
              {units.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/70">Unit / plot <span className="text-white/40">(optional)</span></label>
                  <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={`${field} [&>option]:bg-[#0a0d14]`}>
                    <option value="">Any unit in this project</option>
                    {units.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.unitNumber} · {u.type} · {Math.round(u.areaSqft).toLocaleString("en-IN")} sq ft{u.status !== "AVAILABLE" ? ` (${u.status.toLowerCase()})` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedUnit && selectedUnit.price > 0 && (
                    <p className="mt-1 text-[11px] text-white/50">₹{Math.round(selectedUnit.price).toLocaleString("en-IN")}</p>
                  )}
                </div>
              )}

              {/* Who */}
              {isBuyer ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50"><UserRound size={12} /> Your details</p>
                  <p className="mt-1.5 text-sm font-semibold">{user?.name}</p>
                  <p className="text-xs text-white/60">{[accountPhone && `+91 ${accountPhone}`, user?.email].filter(Boolean).join(" · ")}</p>
                  {needsBuyerPhone && (
                    <input className={`${field} mt-2`} inputMode="tel" placeholder="Your 10-digit mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Customer details</p>
                    <span className="truncate rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/60">
                      {role === "CP" ? "Channel Partner" : "Ambassador"}: {user?.name}{referralCode ? ` · ID ${referralCode}` : ""}
                    </span>
                  </div>
                  <input className={field} placeholder="Customer name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <input className={field} inputMode="tel" placeholder="Mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
                    <input className={field} type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
                  </div>
                </div>
              )}

              {/* Site visit */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-white/70"><CalendarDays size={12} /> Site visit date</label>
                  <input type="date" className={`${field} [color-scheme:dark]`} min={today} max={istToday(180)} value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-white/70"><Clock size={12} /> Preferred time</label>
                  <select className={`${field} [&>option]:bg-[#0a0d14]`} value={visitTime} onChange={(e) => setVisitTime(e.target.value)} disabled={!slots.length}>
                    {slots.length ? slots.map((t) => <option key={t} value={t}>{formatTime(t)}</option>) : <option>No slots left today</option>}
                  </select>
                </div>
              </div>

              {/* Requirement */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/70">Purpose / requirement</label>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {REQUIREMENTS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRequirement(r)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${requirement === r ? "border-[var(--trust)]/60 bg-[var(--trust)]/15 text-sky-100" : "border-white/12 text-white/65 hover:bg-white/[0.06]"}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <input className={field} placeholder="e.g. 2,000 sq ft plot, budget ₹40 L" value={requirement} onChange={(e) => setRequirement(e.target.value)} maxLength={300} />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/70">Notes <span className="text-white/40">(optional)</span></label>
                <textarea className={`${field} min-h-[70px] resize-y`} placeholder="Anything the team should know" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
              </div>

              <div ref={alertRef} className="space-y-2 scroll-mb-4">
                {error && (
                  <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" role="alert">
                    {error}
                    {needsJoining && (
                      <Link to="/cp/dashboard" onClick={onClose} className="ml-1 font-semibold text-white underline">Complete it now</Link>
                    )}
                  </p>
                )}
                {duplicate && (
                  <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100">
                    <p>{duplicate}</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => submit(true)} disabled={submitting} className="rounded-lg bg-amber-400 px-3 py-1.5 font-semibold text-black disabled:opacity-50">Yes, submit</button>
                      <button type="button" onClick={() => setDuplicate(null)} className="rounded-lg border border-white/15 px-3 py-1.5">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-white/10 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="submit"
                disabled={submitting || !!duplicate}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--trust)] to-[#2563eb] py-3 text-sm font-semibold text-white transition hover:shadow-[0_0_22px_rgba(59,130,246,0.35)] disabled:opacity-60"
              >
                {submitting && <Loader2 size={15} className="animate-spin" />}
                {submitting ? "Submitting…" : "Submit Lead"}
              </button>
              <p className="mt-1.5 text-center text-[10px] text-white/45">
                Visit on {formatDate(visitDate)} at {slots.includes(visitTime) ? formatTime(visitTime) : "—"}
              </p>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
