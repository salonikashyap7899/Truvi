import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Toaster } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import WelcomeGate from "@/components/WelcomeGate";
import Onboarding from "@/components/Onboarding";
import WhatsAppChannelPrompt from "@/components/WhatsAppChannelPrompt";
import AskTruvi from "@/components/AskTruvi";
import AISalesCopilot from "@/components/AISalesCopilot";
import { CursorGlow } from "@/components/landing/CursorGlow";

const AmbientBackground = lazy(() =>
  import("@/components/landing/AmbientBackground").then((m) => ({ default: m.AmbientBackground })),
);

// Eager: the shell components + the landing page (first paint must be instant).
import LandingPage from "@/pages/LandingPage";
import MobileTabBar from "@/components/mobile/MobileTabBar";
import InvestFab from "@/components/InvestFab";
import NativeShell from "@/components/NativeShell";
import OfflineBanner from "@/components/OfflineBanner";
import PushRegistration from "@/components/PushRegistration";
import { IS_TOUCH } from "@/lib/device";
import { IS_NATIVE, showsTabBar } from "@/lib/native";
import { useLocationStore } from "@/store/locationStore";
import "@/styles/mobile-app.css";
import { TermsPage, RefundPolicyPage, PrivacyPolicyPage } from "@/pages/policy/PolicyPages";

// Every other route page is lazy-loaded, so the initial download is tiny and
// the app opens fast; each page's code is fetched only when its route opens.
const IntelligencePage = lazy(() => import("@/pages/IntelligencePage"));
const HomePage = lazy(() => import("@/pages/HomePage"));
const JoinPage = lazy(() => import("@/pages/JoinPage"));
const AboutPage = lazy(() => import("@/pages/AboutPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const SignupPage = lazy(() => import("@/pages/SignupPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPasswordPage"));
const VerifyEmailPage = lazy(() => import("@/pages/VerifyEmailPage"));
const UnauthorizedPage = lazy(() => import("@/pages/UnauthorizedPage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));
const LegalPage = lazy(() => import("@/pages/LegalPage"));
const TruviInvestPage = lazy(() => import("@/pages/TruviInvestPage"));

const AdminOsDashboardPage = lazy(() => import("@/pages/admin/AdminOsDashboardPage"));
const AdminUsersPage = lazy(() => import("@/pages/admin/AdminUsersPage"));
const AdminUserProfilePage = lazy(() => import("@/pages/admin/AdminUserProfilePage"));
const AdminListingsPage = lazy(() => import("@/pages/admin/AdminListingsPage"));
const AdminProjectManagePage = lazy(() => import("@/pages/admin/AdminProjectManagePage"));
const AdminRevenuePage = lazy(() => import("@/pages/admin/AdminRevenuePage"));
const AdminSettingsPage = lazy(() => import("@/pages/admin/AdminSettingsPage"));
const FounderDashboardPage = lazy(() => import("@/pages/FounderDashboardPage"));
const AmbassadorSignupPage = lazy(() => import("@/pages/AmbassadorSignupPage"));
const AmbassadorLoginPage = lazy(() => import("@/AmbassadorLoginPage"));
const AmbassadorDashboardPage = lazy(() => import("@/pages/AmbassadorDashboardPage"));

const DeveloperDashboardPage = lazy(() => import("@/pages/developer/DeveloperDashboardPage"));
const DeveloperInventoryPage = lazy(() => import("@/pages/developer/DeveloperInventoryPage"));
const DeveloperSalesPage = lazy(() => import("@/pages/developer/DeveloperSalesPage"));
const DeveloperAnalyticsPage = lazy(() => import("@/pages/developer/DeveloperAnalyticsPage"));
const DeveloperMarketingPage = lazy(() => import("@/pages/developer/DeveloperMarketingPage"));
const NewProjectPage = lazy(() => import("@/pages/developer/NewProjectPage"));
const DeveloperGuidePage = lazy(() => import("@/pages/developer/DeveloperGuidePage"));
const CpGuidePage = lazy(() => import("@/pages/cp/CpGuidePage"));
const ProjectDetailPage = lazy(() => import("@/pages/developer/ProjectDetailPage"));

const CPDashboardPage = lazy(() => import("@/pages/cp/CPDashboardPage"));
const CpCommissionsPage = lazy(() => import("@/pages/cp/CpCommissionsPage"));
const MarketplacePage = lazy(() => import("@/pages/cp/MarketplacePage"));
const LearningAcademyPage = lazy(() => import("@/pages/cp/LearningAcademyPage"));
const TruviConnectPage = lazy(() => import("@/pages/cp/TruviConnectPage"));
const SalesHubPage = lazy(() => import("@/pages/cp/SalesHubPage"));
const AIHubPage = lazy(() => import("@/pages/cp/AIHubPage"));
const BusinessHubPage = lazy(() => import("@/pages/cp/BusinessHubPage"));
const GrowthHubPage = lazy(() => import("@/pages/cp/GrowthHubPage"));
const OnboardDevelopersPage = lazy(() => import("@/pages/cp/OnboardDevelopersPage"));
const BuyerDashboardPage = lazy(() => import("@/pages/buyer/BuyerDashboardPage"));
const BuyerProjectsPage = lazy(() => import("@/pages/buyer/BuyerProjectsPage"));
const ComparePage = lazy(() => import("@/pages/buyer/ComparePage"));
const InventoryPage = lazy(() => import("@/pages/InventoryPage"));
const ProjectPresentationPage = lazy(() => import("@/pages/ProjectPresentationPage"));
const ProjectLandingPage = lazy(() => import("@/pages/ProjectLandingPage"));
const PipelinePage = lazy(() => import("@/pages/crm/PipelinePage"));
const BookingsPage = lazy(() => import("@/pages/crm/BookingsPage"));
const AdminAuditLogsPage = lazy(() => import("@/pages/admin/AdminAuditLogsPage"));
const VaultPage = lazy(() => import("@/pages/VaultPage"));

// Leaflet only loads when someone opens the map; the 3D viewer is its own chunk.
const ProjectsMapPage = lazy(() => import("@/pages/ProjectsMapPage"));
const ThreeDViewPage = lazy(() => import("@/pages/ThreeDViewPage"));

const AdminEnquiriesPage = lazy(() => import("@/pages/admin/AdminEnquiriesPage"));
const AdminCallsPage = lazy(() => import("@/pages/admin/AdminCallsPage"));
const AdminVouchersPage = lazy(() => import("@/pages/admin/AdminVouchersPage"));
const AdminAmbassadorTasksPage = lazy(() => import("@/pages/admin/AdminAmbassadorTasksPage"));
const AdminPaymentsPage = lazy(() => import("@/pages/admin/AdminPaymentsPage"));
const AdminVerificationPage = lazy(() => import("@/pages/admin/AdminVerificationPage"));
const AdminKycPage = lazy(() => import("@/pages/admin/AdminKycPage"));
const AdminReferralLeadsPage = lazy(() => import("@/pages/admin/AdminReferralLeadsPage"));
const AdminDocumentsPage = lazy(() => import("@/pages/admin/AdminDocumentsPage"));
const AdminFinancePage = lazy(() => import("@/pages/admin/AdminFinancePage"));
const AdminCommissionsPage = lazy(() => import("@/pages/admin/AdminCommissionsPage"));
const AdminInvestmentsPage = lazy(() => import("@/pages/admin/AdminInvestmentsPage"));
const AdminAmbassadorKnowledgePage = lazy(() => import("@/pages/admin/AdminAmbassadorKnowledgePage"));
const AdminAcademyPage = lazy(() => import("@/pages/admin/AdminAcademyPage"));
const MarketingManagementPage = lazy(() => import("@/pages/admin/MarketingManagementPage"));
const AdminNotificationsPage = lazy(() => import("@/pages/admin/AdminNotificationsPage"));
const MarketingDashboardPage = lazy(() => import("@/pages/marketing/MarketingDashboardPage"));
const PricingPage = lazy(() => import("@/pages/PricingPage"));
const PaymentSuccessPage = lazy(() => import("@/pages/PaymentSuccessPage"));
const PaymentFailedPage = lazy(() => import("@/pages/PaymentFailedPage"));

// The Founder Dashboard ships its own AI Copilot FAB, so suppress the global
// floating assistants there to avoid two overlapping buttons.
/** Tiny centered spinner shown while a lazy route chunk is loading. */
function RouteFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#06090f]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
    </div>
  );
}

function FloatingAssistants() {
  const { pathname } = useLocation();
  // The Founder Dashboard ships its own Copilot; the Admin OS dashboard uses
  // the same full-screen shell — suppress the global FABs on both.
  if (pathname.startsWith("/founder") || pathname === "/admin/dashboard") return null;
  return (
    <>
      {/* All assistants stay available in the app too. The bottom "Ask Truvi"
          tab also opens AskTruvi via the open-ask-truvi event; in the app the
          floating buttons are lifted above the tab bar (see mobile-app.css). */}
      <AskTruvi />
      <AISalesCopilot />
    </>
  );
}

function Ambience() {
  const { pathname } = useLocation();
  // On phones / the installed app the decorative WebGL city backdrop is pure
  // cost — it pulls the heavy three.js chunk and runs a constant animation loop
  // on data-heavy screens (Explore, dashboards), and CursorGlow needs a mouse
  // that touch devices don't have. Skip both there so those screens load and
  // scroll fast; desktop keeps the richer ambience.
  if (IS_TOUCH) return null;
  // The landing page renders its own richer CityCanvas scene; the Founder
  // Dashboard uses its own light Founder-OS surface.
  if (pathname === "/" || pathname.startsWith("/founder") || pathname === "/admin/dashboard") return null;
  return (
    <>
      <Suspense fallback={null}>
        <AmbientBackground />
      </Suspense>
      <CursorGlow />
    </>
  );
}


function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // On phones a 0.5s slide-up on every page (with all its content) reads as
  // lag on each tap. There we use a quick opacity-only fade with no vertical
  // travel, so navigation feels instant and native. Desktop keeps the richer
  // motion.
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: IS_TOUCH ? 0 : 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: IS_TOUCH ? 0.18 : 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-10 min-h-full"
      // Leave room for the app's bottom tab bar so it never covers content.
      style={showsTabBar(pathname) ? { paddingBottom: "calc(64px + env(safe-area-inset-bottom, 0px))" } : undefined}
    >
      {children}
    </motion.div>
  );
}

/**
 * First-run onboarding tour — shown once in the installed app (remembered via
 * localStorage). Purely additive; it doesn't touch any existing flow.
 */
function OnboardingGate() {
  const [show, setShow] = useState(() => {
    try {
      return IS_NATIVE && !localStorage.getItem("truvi_onboarding_seen");
    } catch {
      return false;
    }
  });
  if (!show) return null;
  return (
    <Onboarding
      onDone={() => {
        try { localStorage.setItem("truvi_onboarding_seen", "1"); } catch { /* ignore */ }
        setShow(false);
      }}
    />
  );
}

/** Standalone /welcome route so the tour can be previewed any time (web too). */
function WelcomeRoute() {
  const navigate = useNavigate();
  return <Onboarding onDone={() => navigate("/")} />;
}


export default function App() {
  // In the installed app, ask for the user's location on open so "Near Me" and
  // property distances work right away. On the web we ask only when needed.
  useEffect(() => {
    if (IS_NATIVE) useLocationStore.getState().request();
  }, []);

  // Once the app is idle, quietly pre-load the chunks for the screens people
  // open most (Explore + a listing). Their code is then already in memory, so
  // tapping through feels instant instead of showing a loading state. Failures
  // are ignored — this is a best-effort warm-up, not a dependency.
  useEffect(() => {
    const warm = () => {
      import("@/pages/InventoryPage").catch(() => {});
      import("@/pages/ProjectPresentationPage").catch(() => {});
    };
    const w = window as unknown as { requestIdleCallback?: (cb: () => void) => number };
    const id = w.requestIdleCallback ? w.requestIdleCallback(warm) : window.setTimeout(warm, 1800);
    return () => {
      const wc = window as unknown as { cancelIdleCallback?: (id: number) => void };
      if (wc.cancelIdleCallback) wc.cancelIdleCallback(id as number);
      else clearTimeout(id as number);
    };
  }, []);

  return (
    <BrowserRouter>
      <NativeShell />
      <OfflineBanner />
      <PushRegistration />
      <Toaster richColors position="top-right" theme="dark" />
      <Ambience />
      <WelcomeGate />
      <OnboardingGate />
      <WhatsAppChannelPrompt />
      <FloatingAssistants />
      <InvestFab />
      <PageTransition>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Public marketing pages */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/welcome" element={<WelcomeRoute />} />
        <Route path="/intelligence" element={<IntelligencePage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/invest" element={<TruviInvestPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/legal" element={<LegalPage />} />
        <Route
          path="/pricing"
          element={
            <ProtectedRoute roles={["ADMIN", "DEVELOPER", "CP", "BUYER", "AMBASSADOR", "VERIFIER"]}>
              <PricingPage />
            </ProtectedRoute>
          }
        />
        <Route path="/payment-success" element={<PaymentSuccessPage />} />
        <Route path="/payment-failed" element={<PaymentFailedPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/refund-policy" element={<RefundPolicyPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Public inventory */}
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/map" element={<Suspense fallback={null}><ProjectsMapPage /></Suspense>} />
        <Route path="/inventory/:id/presentation" element={<ProjectPresentationPage />} />
        {/* Dedicated public project landing page (shareable, conversion-focused) */}
        <Route path="/projects/:id" element={<ProjectLandingPage />} />
        <Route path="/inventory/:id/3d" element={<Suspense fallback={null}><ThreeDViewPage /></Suspense>} />

        {/* Marketing Dashboard — access-gated per-user (server enforces). */}
        <Route path="/marketing" element={<ProtectedRoute roles={["ADMIN", "DEVELOPER", "CP", "BUYER", "AMBASSADOR", "VERIFIER"]}><MarketingDashboardPage /></ProtectedRoute>} />

        {/* Admin */}
        <Route path="/admin/dashboard" element={<ProtectedRoute roles={["ADMIN"]}><AdminOsDashboardPage /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute roles={["ADMIN"]}><AdminUsersPage /></ProtectedRoute>} />
        <Route path="/admin/users/:id" element={<ProtectedRoute roles={["ADMIN"]}><AdminUserProfilePage /></ProtectedRoute>} />
        <Route path="/admin/listings" element={<ProtectedRoute roles={["ADMIN"]}><AdminListingsPage /></ProtectedRoute>} />
        <Route path="/admin/listings/:id" element={<ProtectedRoute roles={["ADMIN"]}><AdminProjectManagePage /></ProtectedRoute>} />
        <Route path="/admin/enquiries" element={<ProtectedRoute roles={["ADMIN"]}><AdminEnquiriesPage /></ProtectedRoute>} />
        <Route path="/admin/calls" element={<ProtectedRoute roles={["ADMIN"]}><AdminCallsPage /></ProtectedRoute>} />
        <Route path="/admin/vouchers" element={<ProtectedRoute roles={["ADMIN"]}><AdminVouchersPage /></ProtectedRoute>} />
        <Route path="/admin/revenue" element={<ProtectedRoute roles={["ADMIN"]}><AdminRevenuePage /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute roles={["ADMIN"]}><AdminSettingsPage /></ProtectedRoute>} />
        <Route path="/admin/ambassador-tasks" element={<ProtectedRoute roles={["ADMIN"]}><AdminAmbassadorTasksPage /></ProtectedRoute>} />
        <Route path="/admin/payments" element={<ProtectedRoute roles={["ADMIN"]}><AdminPaymentsPage /></ProtectedRoute>} />
        <Route path="/admin/marketing" element={<ProtectedRoute roles={["ADMIN"]}><MarketingManagementPage /></ProtectedRoute>} />
        <Route path="/admin/notifications" element={<ProtectedRoute roles={["ADMIN"]}><AdminNotificationsPage /></ProtectedRoute>} />
        <Route path="/admin/verification" element={<ProtectedRoute roles={["ADMIN", "VERIFIER"]}><AdminVerificationPage /></ProtectedRoute>} />
        <Route path="/admin/kyc" element={<ProtectedRoute roles={["ADMIN"]}><AdminKycPage /></ProtectedRoute>} />
        <Route path="/admin/referral-leads" element={<ProtectedRoute roles={["ADMIN"]}><AdminReferralLeadsPage /></ProtectedRoute>} />
        <Route path="/admin/documents" element={<ProtectedRoute roles={["ADMIN"]}><AdminDocumentsPage /></ProtectedRoute>} />
        <Route path="/admin/finance" element={<ProtectedRoute roles={["ADMIN"]}><AdminFinancePage /></ProtectedRoute>} />
        <Route path="/admin/commissions" element={<ProtectedRoute roles={["ADMIN"]}><AdminCommissionsPage /></ProtectedRoute>} />
        <Route path="/admin/investments" element={<ProtectedRoute roles={["ADMIN"]}><AdminInvestmentsPage /></ProtectedRoute>} />
        <Route path="/admin/ambassador-knowledge" element={<ProtectedRoute roles={["ADMIN"]}><AdminAmbassadorKnowledgePage /></ProtectedRoute>} />
        <Route path="/admin/academy" element={<ProtectedRoute roles={["ADMIN"]}><AdminAcademyPage /></ProtectedRoute>} />
        <Route path="/admin/audit-logs" element={<ProtectedRoute roles={["ADMIN"]}><AdminAuditLogsPage /></ProtectedRoute>} />
        <Route path="/founder/dashboard" element={<ProtectedRoute roles={["ADMIN"]}><FounderDashboardPage /></ProtectedRoute>} />
        <Route path="/ambassador" element={<AmbassadorSignupPage />} />
        <Route path="/ambassador/signup" element={<AmbassadorSignupPage />} />
        <Route path="/ambassador/login" element={<AmbassadorLoginPage />} />
        <Route path="/ambassador/dashboard" element={<ProtectedRoute roles={["AMBASSADOR"]}><AmbassadorDashboardPage /></ProtectedRoute>} />

        {/* Developer (ADMIN may enter to review the full developer workflow) */}
        <Route path="/developer/dashboard" element={<ProtectedRoute roles={["DEVELOPER", "ADMIN"]}><DeveloperDashboardPage /></ProtectedRoute>} />
        <Route path="/developer/guide" element={<ProtectedRoute roles={["DEVELOPER", "ADMIN"]}><DeveloperGuidePage /></ProtectedRoute>} />
        <Route path="/developer/inventory" element={<ProtectedRoute roles={["DEVELOPER", "ADMIN"]}><DeveloperInventoryPage /></ProtectedRoute>} />
        <Route path="/developer/crm" element={<ProtectedRoute roles={["DEVELOPER", "ADMIN"]}><DeveloperSalesPage /></ProtectedRoute>} />
        <Route path="/developer/analytics" element={<ProtectedRoute roles={["DEVELOPER", "ADMIN"]}><DeveloperAnalyticsPage /></ProtectedRoute>} />
        <Route path="/developer/campaigns" element={<ProtectedRoute roles={["DEVELOPER", "ADMIN"]}><DeveloperMarketingPage /></ProtectedRoute>} />
        <Route path="/developer/projects/new" element={<ProtectedRoute roles={["DEVELOPER", "ADMIN"]}><NewProjectPage /></ProtectedRoute>} />
        <Route path="/developer/projects/:id" element={<ProtectedRoute roles={["DEVELOPER", "ADMIN"]}><ProjectDetailPage /></ProtectedRoute>} />

        {/* CP */}
        <Route path="/cp/dashboard" element={<ProtectedRoute roles={["CP"]}><CPDashboardPage /></ProtectedRoute>} />
        <Route path="/cp/commissions" element={<ProtectedRoute roles={["CP", "AMBASSADOR"]}><CpCommissionsPage /></ProtectedRoute>} />
        <Route path="/cp/guide" element={<ProtectedRoute roles={["CP", "ADMIN"]}><CpGuidePage /></ProtectedRoute>} />
        <Route path="/cp/marketplace" element={<ProtectedRoute roles={["CP"]}><MarketplacePage /></ProtectedRoute>} />
        <Route path="/cp/academy" element={<ProtectedRoute roles={["CP"]}><LearningAcademyPage /></ProtectedRoute>} />
        <Route path="/cp/sales" element={<ProtectedRoute roles={["CP"]}><SalesHubPage /></ProtectedRoute>} />
        <Route path="/cp/ai" element={<ProtectedRoute roles={["CP"]}><AIHubPage /></ProtectedRoute>} />
        <Route path="/cp/business" element={<ProtectedRoute roles={["CP"]}><BusinessHubPage /></ProtectedRoute>} />
        <Route path="/cp/growth" element={<ProtectedRoute roles={["CP"]}><GrowthHubPage /></ProtectedRoute>} />
        <Route path="/cp/onboard-developers" element={<ProtectedRoute roles={["CP", "DEVELOPER", "AMBASSADOR"]}><OnboardDevelopersPage /></ProtectedRoute>} />
        <Route path="/cp/connect" element={<ProtectedRoute roles={["CP", "DEVELOPER", "ADMIN"]}><TruviConnectPage /></ProtectedRoute>} />
        <Route path="/crm/pipeline" element={<ProtectedRoute roles={["CP", "DEVELOPER", "ADMIN"]}><PipelinePage /></ProtectedRoute>} />
        <Route path="/bookings" element={<ProtectedRoute roles={["CP", "DEVELOPER", "ADMIN"]}><BookingsPage /></ProtectedRoute>} />
        <Route path="/vault" element={<ProtectedRoute roles={["CP", "DEVELOPER", "ADMIN"]}><VaultPage /></ProtectedRoute>} />

        {/* Buyer */}
        <Route path="/buyer/dashboard" element={<ProtectedRoute roles={["BUYER"]}><BuyerDashboardPage /></ProtectedRoute>} />
        <Route path="/buyer/projects" element={<ProtectedRoute roles={["BUYER"]}><BuyerProjectsPage /></ProtectedRoute>} />
        <Route path="/buyer/compare" element={<ProtectedRoute roles={["BUYER"]}><ComparePage /></ProtectedRoute>} />

        {/* 404 — catch-all, must stay last */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
      </PageTransition>
      <MobileTabBar />
    </BrowserRouter>
  );
}
