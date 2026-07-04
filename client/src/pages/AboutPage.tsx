export default function AboutPage() {
  return (
    <main className="min-h-screen px-6 py-20 text-foreground md:px-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-4xl font-semibold">Our mission</h1>
        <p className="mt-6 text-lg text-muted-foreground">
          Truvi exists to make real estate infrastructure trustworthy by default. Not another
          listings portal, not a brokerage — an operating system that developers and channel
          partners rely on because the data is live, the commissions are transparent, and every
          participant is verified before they get access.
        </p>
        <h2 className="mt-10 font-display text-2xl font-semibold">What we believe</h2>
        <ul className="mt-4 space-y-3 text-muted-foreground">
          <li>· Transparency isn&apos;t a feature — it&apos;s the product.</li>
          <li>· A Channel Partner&apos;s commission is theirs, in full, always.</li>
          <li>· Verified access builds a market people can trust.</li>
        </ul>
      </div>
    </main>
  );
}
