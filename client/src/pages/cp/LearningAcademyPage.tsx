import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import {
  BookOpen, CheckCircle, Circle, Award, ArrowLeft, Trophy,
  Home, Scale, Handshake, TrendingUp, Smartphone, Sprout,
  PlayCircle, FileText, type LucideIcon,
} from "lucide-react";

interface Module { id: string; title: string; duration: string; }
interface Course {
  id: string; title: string; description: string; category: string;
  modules: Module[]; badgeColor: string; Icon: LucideIcon;
}

interface AcademyContent {
  _id: string; courseId: string; title: string; type: "VIDEO" | "PDF";
  url: string; description?: string | null; duration?: string | null;
}

function isPlayableVideo(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);
}

const COURSES: Course[] = [
  {
    id: "sales-fundamentals", title: "Real Estate Sales Fundamentals",
    description: "Master the end-to-end sales process from first contact to registration.",
    category: "Sales", badgeColor: "blue", Icon: Home,
    modules: [
      { id: "m1", title: "Understanding Buyer Psychology", duration: "12 min" },
      { id: "m2", title: "Qualifying Leads Effectively", duration: "10 min" },
      { id: "m3", title: "Site Visit Best Practices", duration: "15 min" },
      { id: "m4", title: "Closing Techniques", duration: "18 min" },
      { id: "m5", title: "Post-Booking Follow-Up", duration: "8 min" },
    ],
  },
  {
    id: "rera-compliance", title: "RERA & Legal Compliance",
    description: "Everything a CP needs to know about RERA regulations and legal safeguards.",
    category: "Legal", badgeColor: "green", Icon: Scale,
    modules: [
      { id: "m1", title: "What is RERA and Why it Matters", duration: "14 min" },
      { id: "m2", title: "Verifying a RERA-Registered Project", duration: "10 min" },
      { id: "m3", title: "Common Legal Red Flags in Properties", duration: "16 min" },
      { id: "m4", title: "Buyer Rights & CP Obligations", duration: "12 min" },
    ],
  },
  {
    id: "advanced-negotiation", title: "Advanced Negotiation Skills",
    description: "Handle objections, negotiate confidently, and close more deals.",
    category: "Sales", badgeColor: "purple", Icon: Handshake,
    modules: [
      { id: "m1", title: "The Psychology of Price Negotiation", duration: "11 min" },
      { id: "m2", title: "Handling the 'Too Expensive' Objection", duration: "9 min" },
      { id: "m3", title: "Handling Location & Delivery Concerns", duration: "10 min" },
      { id: "m4", title: "Creating Urgency Without Pressure", duration: "13 min" },
    ],
  },
  {
    id: "investment-analysis", title: "Investment Analysis for Buyers",
    description: "Help buyers understand ROI, appreciation, and rental yields.",
    category: "Finance", badgeColor: "yellow", Icon: TrendingUp,
    modules: [
      { id: "m1", title: "Reading Market Trends", duration: "14 min" },
      { id: "m2", title: "Calculating ROI & Rental Yield", duration: "16 min" },
      { id: "m3", title: "Infrastructure Impact on Property Value", duration: "12 min" },
      { id: "m4", title: "Presenting Investment Cases to Buyers", duration: "15 min" },
    ],
  },
  {
    id: "digital-marketing", title: "Digital Marketing for CPs",
    description: "Generate your own leads using WhatsApp, Instagram, and digital tools.",
    category: "Marketing", badgeColor: "pink", Icon: Smartphone,
    modules: [
      { id: "m1", title: "Building Your Personal Brand", duration: "10 min" },
      { id: "m2", title: "WhatsApp Marketing for Real Estate", duration: "12 min" },
      { id: "m3", title: "Instagram Content Strategy", duration: "14 min" },
    ],
  },
  {
    id: "organic-leads-referrals", title: "Organic Leads & Referrals",
    description: "Get free, high-intent leads and build a referral engine that keeps compounding.",
    category: "Growth", badgeColor: "green", Icon: Sprout,
    modules: [
      { id: "m1", title: "How to Get Organic Leads", duration: "12 min" },
      { id: "m2", title: "Turning Your Network into a Lead Source", duration: "10 min" },
      { id: "m3", title: "How to Get Referrals from Happy Buyers", duration: "13 min" },
      { id: "m4", title: "Building a Repeatable Referral System", duration: "11 min" },
    ],
  },
];

/** Lightweight course list (id + title) reused by the admin content manager. */
export const COURSE_OPTIONS = COURSES.map((c) => ({ id: c.id, title: c.title }));

/** Total runtime of a course, summed from its module durations ("12 min"). */
function courseMinutes(course: Course): number {
  return course.modules.reduce((sum, m) => sum + (parseInt(m.duration, 10) || 0), 0);
}
const CATEGORIES = ["All", ...Array.from(new Set(COURSES.map((c) => c.category)))];

interface ProgressMap { [courseId: string]: { completedModules: string[]; completedAt?: string } }

export default function LearningAcademyPage() {
  const user = useAuthStore((s) => s.user);
  const [progressMap, setProgressMap] = useState<ProgressMap>({});
  const [contentMap, setContentMap] = useState<Record<string, AcademyContent[]>>({});
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [certCourse, setCertCourse] = useState<Course | null>(null);
  const [catFilter, setCatFilter] = useState("All");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/academy/progress").then((res) => {
        const map: ProgressMap = {};
        for (const p of res.data.progress) {
          map[p.courseId] = { completedModules: p.completedModules, completedAt: p.completedAt };
        }
        setProgressMap(map);
      }),
      api.get("/academy/content").then((res) => {
        const map: Record<string, AcademyContent[]> = {};
        for (const c of res.data.content as AcademyContent[]) {
          (map[c.courseId] ||= []).push(c);
        }
        setContentMap(map);
      }),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function toggleModule(course: Course, moduleId: string) {
    const prog = progressMap[course.id] || { completedModules: [] };
    const isCompleted = prog.completedModules.includes(moduleId);

    try {
      if (isCompleted) {
        await api.delete(`/academy/progress/${course.id}/module/${moduleId}`);
        setProgressMap((prev) => ({
          ...prev,
          [course.id]: {
            ...prev[course.id],
            completedModules: (prev[course.id]?.completedModules || []).filter((m) => m !== moduleId),
            completedAt: undefined,
          },
        }));
      } else {
        const res = await api.post(`/academy/progress/${course.id}`, {
          moduleId, totalModules: course.modules.length, courseTitle: course.title,
        });
        const updated = res.data.progress;
        setProgressMap((prev) => ({
          ...prev,
          [course.id]: { completedModules: updated.completedModules, completedAt: updated.completedAt },
        }));
        if (updated.completedAt) {
          toast.success("Course completed! Certificate earned.");
          setCertCourse(course);
        }
      }
    } catch {
      toast.error("Failed to update progress");
    }
  }

  const totalCompleted = Object.values(progressMap).filter((p) => p.completedAt).length;

  if (loading) return <div className="min-h-screen p-10 text-white">Loading…</div>;

  return (
    <main className="min-h-screen p-6 text-white md:p-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link to="/cp/dashboard" className="text-muted-foreground hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BookOpen size={22} className="text-blue-400" /> Truvi Learning Academy
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Complete courses, earn certifications, and advance your CP tier.
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4">
        <div className="rounded-xl border border-blue-800 bg-blue-950/40 px-4 py-2 text-sm">
          <span className="text-blue-300 font-medium">{totalCompleted}</span>
          <span className="text-muted-foreground"> / {COURSES.length} courses completed</span>
        </div>
        {totalCompleted >= COURSES.length && (
          <Badge variant="featured"><Trophy size={12} className="mr-1 inline" /> Academy Graduate</Badge>
        )}
      </div>

      {/* Certificate Modal */}
      {certCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-yellow-700 bg-white/5 p-8 text-center shadow-2xl">
            <Trophy size={48} className="mx-auto text-yellow-400 mb-4" />
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Certificate of Completion</p>
            <h2 className="text-xl font-bold text-white">{certCourse.title}</h2>
            <p className="mt-3 text-sm text-muted-foreground">Awarded to</p>
            <p className="text-lg font-semibold text-yellow-400">{user?.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">Truvi Learning Academy · {new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}</p>
            <Button className="mt-6 w-full" onClick={() => setCertCourse(null)}>Close</Button>
          </div>
        </div>
      )}

      {/* Course grid / detail */}
      {activeCourse ? (
        <div className="mt-6">
          <button onClick={() => setActiveCourse(null)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-white mb-4 transition-colors">
            <ArrowLeft size={14} /> Back to courses
          </button>

          <div className="rounded-2xl border border-white/10 glass p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <activeCourse.Icon size={30} className="text-sky-300" />
                <h2 className="mt-2 text-xl font-semibold">{activeCourse.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{activeCourse.description}</p>
              </div>
              {progressMap[activeCourse.id]?.completedAt && (
                <button
                  onClick={() => setCertCourse(activeCourse)}
                  className="flex items-center gap-1.5 rounded-lg border border-yellow-700 bg-yellow-950/40 px-3 py-1.5 text-xs text-yellow-400 hover:bg-yellow-900/40 transition-colors shrink-0"
                >
                  <Award size={13} /> View Certificate
                </button>
              )}
            </div>

            <div className="mt-6 space-y-2">
              {activeCourse.modules.map((mod) => {
                const done = progressMap[activeCourse.id]?.completedModules.includes(mod.id);
                return (
                  <button
                    key={mod.id}
                    onClick={() => toggleModule(activeCourse, mod.id)}
                    className={`w-full flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${done ? "border-green-800 bg-green-950/30" : "border-white/10 bg-white/5 hover:border-white/15"}`}
                  >
                    {done
                      ? <CheckCircle size={18} className="text-green-400 shrink-0" />
                      : <Circle size={18} className="text-muted-foreground shrink-0" />}
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${done ? "text-green-300" : "text-white"}`}>{mod.title}</p>
                      <p className="text-xs text-muted-foreground">{mod.duration}</p>
                    </div>
                    <span className={`text-xs ${done ? "text-green-500" : "text-muted-foreground"}`}>{done ? "Done" : "Mark complete"}</span>
                  </button>
                );
              })}
            </div>

            {(contentMap[activeCourse.id]?.length ?? 0) > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <PlayCircle size={16} className="text-sky-300" /> Videos & Resources
                </h3>
                <div className="space-y-3">
                  {contentMap[activeCourse.id].map((item) => (
                    <div key={item._id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center gap-2">
                        {item.type === "VIDEO"
                          ? <PlayCircle size={16} className="text-sky-300 shrink-0" />
                          : <FileText size={16} className="text-rose-300 shrink-0" />}
                        <p className="text-sm font-medium text-white">{item.title}</p>
                        {item.duration && <span className="text-xs text-muted-foreground">· {item.duration}</span>}
                      </div>
                      {item.description && <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>}
                      {item.type === "VIDEO" && isPlayableVideo(item.url) ? (
                        <video controls src={item.url} className="mt-3 w-full rounded-lg border border-white/10 bg-black" />
                      ) : (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-sky-300 hover:bg-white/10 transition-colors"
                        >
                          {item.type === "VIDEO" ? <PlayCircle size={13} /> : <FileText size={13} />}
                          {item.type === "VIDEO" ? "Watch video" : "Open PDF"} ↗
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.round(((progressMap[activeCourse.id]?.completedModules.length || 0) / activeCourse.modules.length) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground text-right">
              {progressMap[activeCourse.id]?.completedModules.length || 0} / {activeCourse.modules.length} modules
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Category filter (Netflix-style rails) */}
          <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${catFilter === cat ? "bg-blue-600 text-white" : "glass border border-white/10 text-muted-foreground hover:text-white"}`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COURSES.filter((c) => catFilter === "All" || c.category === catFilter).map((course, idx) => {
              const prog = progressMap[course.id];
              const completed = prog?.completedModules.length || 0;
              const total = course.modules.length;
              const pct = Math.round((completed / total) * 100);
              const isDone = !!prog?.completedAt;

              return (
                <button
                  key={course.id}
                  onClick={() => setActiveCourse(course)}
                  style={{ animationDelay: `${idx * 45}ms` }}
                  className={`tv-fade-up tv-lift text-left rounded-2xl border p-5 ${isDone ? "border-green-800 bg-[var(--growth)]/10" : "border-white/10 glass"}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/15 text-sky-300"><course.Icon size={20} /></div>
                    {isDone
                      ? <span className="flex items-center gap-1 text-xs text-green-400"><Award size={12} /> Certified</span>
                      : <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">{course.category}</span>}
                  </div>
                  <h3 className="mt-3 font-semibold text-white text-sm">{course.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{course.description}</p>

                  {/* Meta: lessons · duration · certificate */}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><BookOpen size={12} /> {total} lesson{total === 1 ? "" : "s"}</span>
                    <span className="inline-flex items-center gap-1"><PlayCircle size={12} /> {courseMinutes(course)} min</span>
                    <span className="inline-flex items-center gap-1"><Award size={12} /> Certificate</span>
                  </div>

                  <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${isDone ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{completed}/{total} · {pct}% complete</p>
                </button>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
