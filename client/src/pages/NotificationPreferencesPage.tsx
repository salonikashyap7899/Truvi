import { useEffect, useState } from "react";
import { Bell, BellRing, Mail, MessageCircle, Save, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";

interface Preferences {
  inApp: boolean;
  email: boolean;
  whatsapp: boolean;
  whatsappAvailable: boolean;
  whatsappProviderConfigured?: boolean;
}

export default function NotificationPreferencesPage() {
  const user = useAuthStore((state) => state.user);
  const [preferences, setPreferences] = useState<Preferences>({
    inApp: true,
    email: true,
    whatsapp: false,
    whatsappAvailable: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get("/notifications/preferences")
      .then((response) => {
        if (!cancelled) setPreferences(response.data.preferences as Preferences);
      })
      .catch((error: any) => {
        if (!cancelled) toast.error(error?.response?.data?.error || "Could not load notification preferences.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function save() {
    setSaving(true);
    try {
      const response = await api.put("/notifications/preferences", {
        inApp: preferences.inApp,
        email: preferences.email,
      });
      setPreferences((current) => ({ ...current, ...(response.data.preferences as Preferences) }));
      toast.success("Notification preferences saved.");
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Could not save notification preferences.");
    } finally {
      setSaving(false);
    }
  }

  const setChannel = (key: "inApp" | "email", enabled: boolean) =>
    setPreferences((current) => ({ ...current, [key]: enabled }));

  return (
    <main className="min-h-screen px-4 py-8 pb-24 text-white sm:px-6 md:px-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Your account</p>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold sm:text-3xl"><Settings2 size={25} /> Notification preferences</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Choose how Truvi sends property recommendations and requirement-match updates. Essential account and security messages may still be sent where required.</p>
          </div>
          <Link to="/requirements" className="shrink-0 text-sm text-teal-300 hover:text-teal-200">Requirements →</Link>
        </div>

        <section className="mt-7 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-6">
          <h2 className="font-semibold">Property recommendations</h2>
          <p className="mt-1 text-sm text-muted-foreground">These settings control matching-property messages for your active requirements.</p>

          <div className="mt-5 divide-y divide-white/10">
            <label className="flex cursor-pointer items-start gap-3 py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-400/10 text-teal-300"><BellRing size={19} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">In-app notifications</span>
                <span className="mt-1 block text-sm text-muted-foreground">Show matching-property alerts in your Truvi notification bell and history.</span>
              </span>
              <input type="checkbox" checked={preferences.inApp} disabled={loading || saving} onChange={(event) => setChannel("inApp", event.target.checked)} className="mt-2 size-5 accent-teal-400" />
            </label>

            <label className="flex cursor-pointer items-start gap-3 py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-400/10 text-sky-300"><Mail size={19} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Property recommendation emails</span>
                <span className="mt-1 block text-sm text-muted-foreground">Send an email when verified, approved inventory matches one of your active requirements. Email needs a verified address and configured SMTP service.</span>
              </span>
              <input type="checkbox" checked={preferences.email} disabled={loading || saving} onChange={(event) => setChannel("email", event.target.checked)} className="mt-2 size-5 accent-sky-400" />
            </label>

            <div className="flex items-start gap-3 py-4 opacity-75">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300"><MessageCircle size={19} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">WhatsApp property alerts <span className="ml-1 text-xs text-amber-300">Not available</span></span>
                <span className="mt-1 block text-sm text-muted-foreground">Truvi’s current WhatsApp dispatcher is limited to existing configured developer events. Property-match WhatsApp alerts are not enabled; this page will not claim delivery.</span>
              </span>
              <input type="checkbox" checked={false} disabled aria-label="WhatsApp property alerts unavailable" className="mt-2 size-5" />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
            <p className="text-xs text-muted-foreground">Signed in as {user?.email || "your Truvi account"}</p>
            <Button onClick={save} disabled={loading || saving} type="button">
              <Save size={15} /> {saving ? "Saving..." : "Save preferences"}
            </Button>
          </div>
        </section>

        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Changing a setting affects future property recommendation notifications. It does not delete your existing notification history or disable essential account and security notifications.
        </p>
      </div>
    </main>
  );
}
