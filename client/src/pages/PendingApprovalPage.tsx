import { Card } from "@/components/ui/primitives";

export default function PendingApprovalPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAF6F0] px-4">
      <Card className="max-w-md text-center">
        <h1 className="font-serif text-2xl font-semibold text-[#3A2E26]">Account pending approval</h1>
        <p className="mt-3 text-sm text-neutral-500">
          Thanks for signing up. A Truvi admin is reviewing your account. You&apos;ll be able to log in
          fully once you&apos;re approved — this usually happens within 24 hours.
        </p>
      </Card>
    </main>
  );
}
