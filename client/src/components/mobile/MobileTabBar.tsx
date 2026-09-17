import { useLocation, useNavigate } from "react-router-dom";
import { Home, Building2, Sparkles, User, type LucideIcon } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { dashboardPath } from "@/lib/rolePaths";
import { showsTabBar } from "@/lib/native";

interface Tab {
  key: string;
  label: string;
  Icon: LucideIcon;
  /** Target route, or null for an action tab (Ask Truvi). */
  to: string | null;
  onPress?: () => void;
  isActive: (pathname: string) => boolean;
}

/**
 * Native app bottom navigation. Only rendered inside the installed app (the
 * website never shows it). Gives the app a real tab bar so it stops feeling
 * like a website in a wrapper. Tabs adapt to whether the user is signed in.
 */
export default function MobileTabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  if (!showsTabBar(pathname)) return null;

  const accountTo = user ? dashboardPath(user) : "/login";

  const tabs: Tab[] = [
    { key: "home", label: "Home", Icon: Home, to: "/", isActive: (p) => p === "/" },
    {
      key: "explore",
      label: "Explore",
      Icon: Building2,
      to: "/inventory",
      isActive: (p) => p === "/inventory",
    },
    {
      key: "ask",
      label: "Ask Truvi",
      Icon: Sparkles,
      to: null,
      onPress: () => window.dispatchEvent(new Event("open-ask-truvi")),
      isActive: () => false,
    },
    {
      key: "account",
      label: user ? "Account" : "Sign in",
      Icon: User,
      to: accountTo,
      isActive: (p) => p.startsWith("/developer") || p.startsWith("/cp") || p.startsWith("/buyer") || p.startsWith("/ambassador") || p.startsWith("/admin") || p.startsWith("/founder") || p === "/login",
    },
  ];

  return (
    <nav
      aria-label="Primary"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        display: "flex",
        justifyContent: "space-around",
        alignItems: "stretch",
        background: "rgba(8,11,18,0.92)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {tabs.map((t) => {
        const active = t.isActive(pathname);
        return (
          <button
            key={t.key}
            onClick={() => {
              if (t.onPress) t.onPress();
              else if (t.to) navigate(t.to);
            }}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              padding: "9px 4px 8px",
              border: "none",
              background: "transparent",
              color: active ? "#3B82F6" : "rgba(255,255,255,0.55)",
              fontSize: 10.5,
              fontWeight: 600,
              cursor: "pointer",
              transition: "color .15s ease",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <t.Icon size={21} strokeWidth={active ? 2.4 : 1.9} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
