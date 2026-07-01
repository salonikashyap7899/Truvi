import { Link } from "react-router-dom";
import { Card } from "@/components/ui/primitives";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAF6F0] px-4">
      <Card className="max-w-md text-center">
        <h1 className="font-serif text-2xl font-semibold text-[#3A2E26]">Not authorized</h1>
        <p className="mt-3 text-sm text-neutral-500">You don&apos;t have access to this page with your current account role.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-blue-600">Back to home</Link>
      </Card>
    </main>
  );
}
