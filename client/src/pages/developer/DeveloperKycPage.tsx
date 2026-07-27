import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { CpKycOnboarding } from "@/components/CpKycOnboarding";

/**
 * Developer identity verification. Reuses the shared KYC submission surface
 * (Aadhaar + PAN + live selfie → POST /auth/submit-kyc) with developer-facing
 * copy. Submissions land in the admin KYC review queue like any other role.
 */
export default function DeveloperKycPage() {
  return (
    <div className="relative">
      <Link
        to="/developer/dashboard"
        className="absolute left-6 top-6 z-10 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white md:left-10"
      >
        <ArrowLeft size={15} /> Back to dashboard
      </Link>
      <CpKycOnboarding
        heading="Verify your identity"
        intro="Verify your identity to earn the verified badge and build buyer trust. Upload your Aadhaar and PAN and take a live selfie — your documents are stored securely and deleted once an admin reviews them."
      />
    </div>
  );
}
