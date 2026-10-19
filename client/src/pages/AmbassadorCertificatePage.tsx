import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, ArrowLeft, Printer, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type CertificateProfile = {
  certificateNo?: string | null;
  certifiedAt?: string | null;
  status: string;
  currentLevel: string;
  ambassadorId: string;
  college?: string | null;
  course?: string | null;
  city: string;
};
export default function AmbassadorCertificatePage() {
  const user = useAuthStore((s) => s.user);
  const [profile, setProfile] = useState<CertificateProfile | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/ambassador-os/me")
      .then((res) => setProfile(res.data.profile as CertificateProfile))
      .catch((error: any) => toast.error(error?.response?.data?.error || "Could not load certificate"))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <main className="p-8 text-white">Loading certificate…</main>;
  if (!profile?.certificateNo || !profile.certifiedAt || profile.status === "SUSPENDED" || profile.status === "EXITED") {
    return <main className="min-h-screen space-y-4 p-8 text-white"><Link to="/ambassador/operating-system" className="inline-flex items-center gap-2 text-sm text-sky-300"><ArrowLeft size={16}/>Back to Ambassador OS</Link><h1 className="text-2xl font-semibold">Certificate not available</h1><p className="text-sm text-muted-foreground">Your certificate is issued after all seven modules, written assessments, practical reviews and ethics checks are completed and approved by Truvi.</p></main>;
  }
  const certifiedDate = new Date(profile.certifiedAt);
  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-900 sm:p-8">
      <div className="certificate-no-print mx-auto mb-5 flex max-w-5xl items-center justify-between gap-3">
        <Link to="/ambassador/operating-system" className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"><ArrowLeft size={16}/>Back to Ambassador OS</Link>
        <Button onClick={() => window.print()}><Printer size={16} className="mr-2"/>Print / Save PDF</Button>
      </div>
      <section id="truvi-ambassador-certificate" className="relative mx-auto flex min-h-[640px] max-w-5xl flex-col items-center justify-center overflow-hidden border-[10px] border-double border-sky-800 bg-[#fffdf7] px-7 py-12 text-center shadow-2xl sm:px-16">
        <div className="absolute inset-3 border border-amber-500/40"/>
        <div className="relative"><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-slate-900 text-amber-300"><Award size={34}/></div><p className="mt-4 text-xs font-bold uppercase tracking-[.35em] text-sky-800">TRUVI VENTURES</p></div>
        <p className="relative mt-7 text-xs font-semibold uppercase tracking-[.28em] text-slate-500">Ambassador Learning Academy</p>
        <h1 className="relative mt-3 font-serif text-4xl font-bold text-slate-900 sm:text-5xl">Certificate of Completion</h1>
        <p className="relative mt-8 text-base text-slate-600">This is to certify that</p>
        <p className="relative mt-3 border-b border-amber-500/60 px-5 pb-3 font-serif text-3xl font-semibold text-sky-950 sm:text-4xl">{user?.name || "Truvi Ambassador"}</p>
        <p className="relative mt-5 max-w-2xl text-base leading-7 text-slate-700">has successfully completed the seven-day Truvi Ambassador Learning Academy, including the written assessments, practical communication review and ethics and compliance review.</p>
        <div className="relative mt-8 grid w-full max-w-2xl gap-4 border-y border-slate-200 py-5 sm:grid-cols-3"><Detail label="Ambassador ID" value={profile.ambassadorId}/><Detail label="Certificate number" value={profile.certificateNo}/><Detail label="Date issued" value={certifiedDate.toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"})}/></div>
        <div className="relative mt-7 flex w-full max-w-2xl flex-wrap items-end justify-between gap-6 text-left"><div><div className="mb-2 w-48 border-t border-slate-400"/><p className="text-sm font-semibold text-slate-800">Truvi Program Team</p><p className="mt-1 text-xs text-slate-500">Authorized internal certificate</p></div><div className="text-right"><ShieldCheck className="ml-auto text-sky-800" size={30}/><p className="mt-2 text-xs text-slate-500">{profile.city}{profile.college ? ` · ${profile.college}` : ""}</p><p className="mt-1 text-xs text-slate-500">Level {profile.currentLevel}</p></div></div>
        <p className="relative mt-auto pt-8 text-[11px] leading-5 text-slate-500">This is an internal Truvi training certificate. It is not a government licence, academic degree, real-estate registration or guarantee of employment, sales performance or earnings.</p>
      </section>
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          body * { visibility: hidden !important; }
          #truvi-ambassador-certificate, #truvi-ambassador-certificate * { visibility: visible !important; }
          #truvi-ambassador-certificate { position: absolute; left: 0; top: 0; width: 100%; min-height: 175mm; box-shadow: none !important; border-width: 6px; }
          .certificate-no-print { display: none !important; }
        }
      `}</style>
    </main>
  );
}
function Detail({label,value}:{label:string;value:string}) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{value}</p></div>;
}
