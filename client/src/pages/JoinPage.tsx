import { Link } from "react-router-dom";

export default function JoinPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-transparent px-6 text-foreground">
      <h1 className="font-display text-3xl font-semibold md:text-5xl">How would you like to <span className="text-gradient-aurora">join Truvi?</span></h1>
      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Link to="/signup" className="w-full rounded-xl border border-white/10 glass p-8 text-center transition hover:-translate-y-1 hover:glow-trust">
          <h2 className="font-display text-xl font-semibold">I&apos;m a Developer</h2>
          <p className="mt-2 text-sm text-muted-foreground">List your projects and manage live inventory, leads, and CP performance.</p>
        </Link>
        <Link to="/signup" className="w-full rounded-xl border border-white/10 glass p-8 text-center transition hover:-translate-y-1 hover:glow-trust">
          <h2 className="font-display text-xl font-semibold">I&apos;m a Channel Partner</h2>
          <p className="mt-2 text-sm text-muted-foreground">Discover verified projects, submit leads, and track every commission.</p>
        </Link>
        <Link to="/signup" className="w-full rounded-xl border border-white/10 glass p-8 text-center transition hover:-translate-y-1 hover:glow-trust">
          <h2 className="font-display text-xl font-semibold">I&apos;m a Buyer</h2>
          <p className="mt-2 text-sm text-muted-foreground">Explore verified projects, save favorites, and schedule site visits.</p>
        </Link>
      </div>
    </main>
  );
}
