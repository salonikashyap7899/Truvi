import { Link } from "react-router-dom";
import { SiteNav } from "@/components/SiteNav";

/**
 * Role picker. Each card sends the visitor to the signup form with that role
 * pre-selected, and offers a role-labeled sign-in for existing accounts.
 * Ambassadors have their own dedicated signup/login flow.
 */
const ROLE_CARDS = [
  {
    title: "I'm a Developer / Seller",
    desc: "List and sell your projects, manage live inventory, leads, and CP performance.",
    signup: "/signup?role=DEVELOPER",
    login: "/login",
    loginLabel: "Sign in as Developer / Seller",
  },
  {
    title: "I'm a Channel Partner",
    desc: "Discover verified projects, submit leads, and track every commission.",
    signup: "/signup?role=CP",
    login: "/login",
    loginLabel: "Sign in as Channel Partner",
  },
  {
    title: "I'm a Buyer",
    desc: "Explore verified projects, save favorites, and schedule site visits.",
    signup: "/signup?role=BUYER",
    login: "/login",
    loginLabel: "Sign in as Buyer",
  },
];

export default function JoinPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-transparent px-4 py-28 text-foreground sm:px-6">
      <SiteNav />
      <h1 className="text-center font-display text-3xl font-semibold md:text-5xl">
        How would you like to <span className="text-gradient-aurora">join Truvi?</span>
      </h1>
      <div className="mt-10 grid w-full max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {ROLE_CARDS.map((card) => (
          <div
            key={card.title}
            className="flex w-full flex-col rounded-xl border border-white/10 glass p-6 text-center transition hover:-translate-y-1 hover:glow-trust"
          >
            <h2 className="font-display text-lg font-semibold">{card.title}</h2>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">{card.desc}</p>
            <Link
              to={card.signup}
              className="mt-5 rounded-full bg-[var(--trust)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--trust)]/85"
            >
              Create account
            </Link>
            <Link
              to={card.login}
              className="mt-2 rounded-full border border-white/15 px-4 py-2 text-xs font-medium text-foreground/85 transition hover:bg-white/5"
            >
              {card.loginLabel}
            </Link>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Every account is verified with email and phone OTP. You&apos;ll only see the workspace for your role.
      </p>
    </main>
  );
}
