import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Toaster } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import WelcomeGate from "@/components/WelcomeGate";
import AskTruvi from "@/components/AskTruvi";
import AISalesCopilot from "@/components/AISalesCopilot";
import { CursorGlow } from "@/components/landing/CursorGlow";

const AmbientBackground = lazy(() =>
  import("@/components/landing/AmbientBackground").then((m) => ({ default: m.AmbientBackground })),
);

import LandingPage from "@/pages/LandingPage";
import IntelligencePage from "@/pages/IntelligencePage";
import HomePage from "@/pages/HomePage";
import JoinPage from "@/pages/JoinPage";
import AboutPage from "@/pages/AboutPage";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import VerifyEmailPage from "@/pages/VerifyEmailPage";
import UnauthorizedPage from "@/pages/UnauthorizedPage";
import LegalPage from "@/pages/LegalPage";

import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminListingsPage from "@/pages/admin/AdminListingsPage";
import AdminProjectManagePage from "@/pages/admin/AdminProjectManagePage";
import AdminRevenuePage from "@/pages/admin/AdminRevenuePage";
import AdminSettingsPage from "@/pages/admin/AdminSettingsPage";
import FounderDashboardPage from "@/pages/FounderDashboardPage";
import AmbassadorSignupPage from "@/pages/AmbassadorSignupPage";
import AmbassadorLoginPage from "@/AmbassadorLoginPage";
import AmbassadorDashboardPage from "@/pages/AmbassadorDashboardPage";

import DeveloperDashboardPage from "@/pages/developer/DeveloperDashboardPage";
import DeveloperInventoryPage from "@/pages/developer/DeveloperInventoryPage";
import DeveloperSalesPage from "@/pages/developer/DeveloperSalesPage";
import DeveloperAnalyticsPage from "@/pages/developer/DeveloperAnalyticsPage";
import DeveloperMarketingPage from "@/pages/developer/DeveloperMarketingPage";
import NewProjectPage from "@/pages/developer/NewProjectPage";
import ProjectDetailPage from "@/pages/developer/ProjectDetailPage";

import CPDashboardPage from "@/pages/cp/CPDashboardPage";
import MarketplacePage from "@/pages/cp/MarketplacePage";
import LearningAcademyPage from "@/pages/cp/LearningAcademyPage";
import TruviConnectPage from "@/pages/cp/TruviConnectPage";
import SalesHubPage from "@/pages/cp/SalesHubPage";
import AIHubPage from "@/pages/cp/AIHubPage";
import BusinessHubPage from "@/pages/cp/BusinessHubPage";
import GrowthHubPage from "@/pages/cp/GrowthHubPage";
import BuyerDashboardPage from "@/pages/buyer/BuyerDashboardPage";
import BuyerProjectsPage from "@/pages/buyer/BuyerProjectsPage";
import ComparePage from "@/pages/buyer/ComparePage";
import InventoryPage from "@/pages/InventoryPage";
import ProjectPresentationPage from "@/pages/ProjectPresentationPage";

// Lazy-loaded so the 3D viewer never weighs down the main bundle.
const ThreeDViewPage = lazy(() => import("@/pages/ThreeDViewPage"));
import AdminEnquiriesPage from "@/pages/admin/AdminEnquiriesPage";
import AdminAmbassadorTasksPage from "@/pages/admin/AdminAmbassadorTasksPage";
import AdminPaymentsPage from "@/pages/admin/AdminPaymentsPage";
import AdminVerificationPage from "@/pages/admin/AdminVerificationPage";
import AdminKycPage from "@/pages/admin/AdminKycPage";
import AdminFinancePage from "@/pages/admin/AdminFinancePage";
import PricingPage from "@/pages/PricingPage";
import PaymentSuccessPage from "@/pages/PaymentSuccessPage";
import PaymentFailedPage from "@/pages/PaymentFailedPage";
import { TermsPage, RefundPolicyPage, PrivacyPolicyPage } from "@/pages/policy/PolicyPages";

function Ambience() {
  const { pathname } = useLocation();
  // The landing page renders its own richer CityCanvas scene
  if (pathname === "/") return null;
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
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-10 min-h-full"
    >
      {children}
    </motion.div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-right" theme="dark" />
      <Ambience />
      <WelcomeGate />
      <AskTruvi />
      <AISalesCopilot />
      <PageTransition>
      <Routes>
        {/* Public marketing pages */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/intelligence" element={<IntelligencePage />} />
        <Route path="/home" element={<HomePage />} />
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
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Public inventory */}
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/inventory/:id/presentation" element={<ProjectPresentationPage />} />
        <Route path="/inventory/:id/3d" element={<Suspense fallback={null}><ThreeDViewPage /></Suspense>} />

        {/* Admin */}
        <Route path="/admin/dashboard" element={<ProtectedRoute roles={["ADMIN"]}><AdminDashboardPage /></ProtectedRoute>} />
        <Route path="/admin/listings" element={<ProtectedRoute roles={["ADMIN"]}><AdminListingsPage /></ProtectedRoute>} />
        <Route path="/admin/listings/:id" element={<ProtectedRoute roles={["ADMIN"]}><AdminProjectManagePage /></ProtectedRoute>} />
        <Route path="/admin/enquiries" element={<ProtectedRoute roles={["ADMIN"]}><AdminEnquiriesPage /></ProtectedRoute>} />
        <Route path="/admin/revenue" element={<ProtectedRoute roles={["ADMIN"]}><AdminRevenuePage /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute roles={["ADMIN"]}><AdminSettingsPage /></ProtectedRoute>} />
        <Route path="/admin/ambassador-tasks" element={<ProtectedRoute roles={["ADMIN"]}><AdminAmbassadorTasksPage /></ProtectedRoute>} />
        <Route path="/admin/payments" element={<ProtectedRoute roles={["ADMIN"]}><AdminPaymentsPage /></ProtectedRoute>} />
        <Route path="/admin/verification" element={<ProtectedRoute roles={["ADMIN", "VERIFIER"]}><AdminVerificationPage /></ProtectedRoute>} />
        <Route path="/admin/kyc" element={<ProtectedRoute roles={["ADMIN"]}><AdminKycPage /></ProtectedRoute>} />
        <Route path="/admin/finance" element={<ProtectedRoute roles={["ADMIN"]}><AdminFinancePage /></ProtectedRoute>} />
        <Route path="/founder/dashboard" element={<ProtectedRoute roles={["ADMIN"]}><FounderDashboardPage /></ProtectedRoute>} />
        <Route path="/ambassador" element={<AmbassadorSignupPage />} />
        <Route path="/ambassador/signup" element={<AmbassadorSignupPage />} />
        <Route path="/ambassador/login" element={<AmbassadorLoginPage />} />
        <Route path="/ambassador/dashboard" element={<ProtectedRoute roles={["AMBASSADOR"]}><AmbassadorDashboardPage /></ProtectedRoute>} />

        {/* Developer (ADMIN may enter to review the full developer workflow) */}
        <Route path="/developer/dashboard" element={<ProtectedRoute roles={["DEVELOPER", "ADMIN"]}><DeveloperDashboardPage /></ProtectedRoute>} />
        <Route path="/developer/inventory" element={<ProtectedRoute roles={["DEVELOPER", "ADMIN"]}><DeveloperInventoryPage /></ProtectedRoute>} />
        <Route path="/developer/crm" element={<ProtectedRoute roles={["DEVELOPER", "ADMIN"]}><DeveloperSalesPage /></ProtectedRoute>} />
        <Route path="/developer/analytics" element={<ProtectedRoute roles={["DEVELOPER", "ADMIN"]}><DeveloperAnalyticsPage /></ProtectedRoute>} />
        <Route path="/developer/campaigns" element={<ProtectedRoute roles={["DEVELOPER", "ADMIN"]}><DeveloperMarketingPage /></ProtectedRoute>} />
        <Route path="/developer/projects/new" element={<ProtectedRoute roles={["DEVELOPER", "ADMIN"]}><NewProjectPage /></ProtectedRoute>} />
        <Route path="/developer/projects/:id" element={<ProtectedRoute roles={["DEVELOPER", "ADMIN"]}><ProjectDetailPage /></ProtectedRoute>} />

        {/* CP */}
        <Route path="/cp/dashboard" element={<ProtectedRoute roles={["CP"]}><CPDashboardPage /></ProtectedRoute>} />
        <Route path="/cp/marketplace" element={<ProtectedRoute roles={["CP"]}><MarketplacePage /></ProtectedRoute>} />
        <Route path="/cp/academy" element={<ProtectedRoute roles={["CP"]}><LearningAcademyPage /></ProtectedRoute>} />
        <Route path="/cp/sales" element={<ProtectedRoute roles={["CP"]}><SalesHubPage /></ProtectedRoute>} />
        <Route path="/cp/ai" element={<ProtectedRoute roles={["CP"]}><AIHubPage /></ProtectedRoute>} />
        <Route path="/cp/business" element={<ProtectedRoute roles={["CP"]}><BusinessHubPage /></ProtectedRoute>} />
        <Route path="/cp/growth" element={<ProtectedRoute roles={["CP"]}><GrowthHubPage /></ProtectedRoute>} />
        <Route path="/cp/connect" element={<ProtectedRoute roles={["CP", "DEVELOPER", "ADMIN"]}><TruviConnectPage /></ProtectedRoute>} />

        {/* Buyer */}
        <Route path="/buyer/dashboard" element={<ProtectedRoute roles={["BUYER"]}><BuyerDashboardPage /></ProtectedRoute>} />
        <Route path="/buyer/projects" element={<ProtectedRoute roles={["BUYER"]}><BuyerProjectsPage /></ProtectedRoute>} />
        <Route path="/buyer/compare" element={<ProtectedRoute roles={["BUYER"]}><ComparePage /></ProtectedRoute>} />
      </Routes>
      </PageTransition>
    </BrowserRouter>
  );
}
