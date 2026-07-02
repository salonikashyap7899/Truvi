import { Link } from "react-router-dom";

export default function JoinPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#FAF6F0] px-6 text-[#3A2E26]">
      <h1 className="font-serif text-3xl font-semibold">How would you like to join Truvi?</h1>
      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Link to="/signup" className="w-full rounded-xl border border-[#e8ddd0] bg-white p-8 text-center hover:shadow-md">
          <h2 className="font-serif text-xl font-semibold">I&apos;m a Developer</h2>
          <p className="mt-2 text-sm text-[#6b5c4f]">List your projects and manage live inventory, leads, and CP performance.</p>
        </Link>
        <Link to="/signup" className="w-full rounded-xl border border-[#e8ddd0] bg-white p-8 text-center hover:shadow-md">
          <h2 className="font-serif text-xl font-semibold">I&apos;m a Channel Partner</h2>
          <p className="mt-2 text-sm text-[#6b5c4f]">Discover verified projects, submit leads, and track every commission.</p>
        </Link>
        <Link to="/signup" className="w-full rounded-xl border border-[#e8ddd0] bg-white p-8 text-center hover:shadow-md">
          <h2 className="font-serif text-xl font-semibold">I&apos;m a Buyer</h2>
          <p className="mt-2 text-sm text-[#6b5c4f]">Explore verified projects, save favorites, and schedule site visits.</p>
        </Link>
      </div>
    </main>
  );
}
