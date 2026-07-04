import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AskTruvi from "@/components/AskTruvi";
import AISalesCopilot from "@/components/AISalesCopilot";

import HomePage from "@/pages/HomePage";
import JoinPage from "@/pages/JoinPage";
import AboutPage from "@/pages/AboutPage";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import PendingApprovalPage from "@/pages/PendingApprovalPage";
import UnauthorizedPage from "@/pages/UnauthorizedPage";

import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminListingsPage from "@/pages/admin/AdminListingsPage";
import AdminRevenuePage from "@/pages/admin/AdminRevenuePage";
import AdminSettingsPage from "@/pages/admin/AdminSettingsPage";

import DeveloperDashboardPage from "@/pages/developer/DeveloperDashboardPage";
import NewProjectPage from "@/pages/developer/NewProjectPage";
import ProjectDetailPage from "@/pages/developer/ProjectDetailPage";

import CPDashboardPage from "@/pages/cp/CPDashboardPage";
import MarketplacePage from "@/pages/cp/MarketplacePage";
import LearningAcademyPage from "@/pages/cp/LearningAcademyPage";
import TruviConnectPage from "@/pages/cp/TruviConnectPage";
import BuyerDashboardPage from "@/pages/buyer/BuyerDashboardPage";
import BuyerProjectsPage from "@/pages/buyer/BuyerProjectsPage";
import ComparePage from "@/pages/buyer/ComparePage";

export default function App() {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-right" theme="dark" />
      <AskTruvi />
      <AISalesCopilot />
      <Routes>
        {/* Public marketing pages */}
        <Route path="/" element={<HomePage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/pending-approval" element={<PendingApprovalPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Admin */}
        <Route path="/admin/dashboard" element={<ProtectedRoute roles={["ADMIN"]}><AdminDashboardPage /></ProtectedRoute>} />
        <Route path="/admin/listings" element={<ProtectedRoute roles={["ADMIN"]}><AdminListingsPage /></ProtectedRoute>} />
        <Route path="/admin/revenue" element={<ProtectedRoute roles={["ADMIN"]}><AdminRevenuePage /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute roles={["ADMIN"]}><AdminSettingsPage /></ProtectedRoute>} />

        {/* Developer */}
        <Route path="/developer/dashboard" element={<ProtectedRoute roles={["DEVELOPER"]}><DeveloperDashboardPage /></ProtectedRoute>} />
        <Route path="/developer/projects/new" element={<ProtectedRoute roles={["DEVELOPER"]}><NewProjectPage /></ProtectedRoute>} />
        <Route path="/developer/projects/:id" element={<ProtectedRoute roles={["DEVELOPER"]}><ProjectDetailPage /></ProtectedRoute>} />

        {/* CP */}
        <Route path="/cp/dashboard" element={<ProtectedRoute roles={["CP"]}><CPDashboardPage /></ProtectedRoute>} />
        <Route path="/cp/marketplace" element={<ProtectedRoute roles={["CP"]}><MarketplacePage /></ProtectedRoute>} />
        <Route path="/cp/academy" element={<ProtectedRoute roles={["CP"]}><LearningAcademyPage /></ProtectedRoute>} />
        <Route path="/cp/connect" element={<ProtectedRoute roles={["CP", "DEVELOPER", "ADMIN"]}><TruviConnectPage /></ProtectedRoute>} />

        {/* Buyer */}
        <Route path="/buyer/dashboard" element={<ProtectedRoute roles={["BUYER"]}><BuyerDashboardPage /></ProtectedRoute>} />
        <Route path="/buyer/projects" element={<ProtectedRoute roles={["BUYER"]}><BuyerProjectsPage /></ProtectedRoute>} />
        <Route path="/buyer/compare" element={<ProtectedRoute roles={["BUYER"]}><ComparePage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
