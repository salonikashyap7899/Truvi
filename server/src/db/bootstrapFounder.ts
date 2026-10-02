import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Db } from "./index";
import { users } from "./schema";
import { DEFAULT_FOUNDER_PASSWORD, getEnv } from "../config/env";

export interface ResolvedFounder {
  name: string;
  email: string;
  /** Effective password: per-founder → shared FOUNDER_PASSWORD → built-in default. */
  password: string;
  /** True when the effective password is the shipped built-in default. */
  usingBuiltInPassword: boolean;
}

/**
 * Resolve the two founders (Sandeep & Meraj) with each one's effective password:
 * a per-founder FOUNDERn_PASSWORD wins, else the shared FOUNDER_PASSWORD, else
 * the strong built-in default.
 */
export function founderDefaults(): { founders: ResolvedFounder[] } {
  const env = getEnv();
  const founders = env.founders.map((f) => {
    const password = f.password || env.founderPassword || DEFAULT_FOUNDER_PASSWORD;
    return {
      name: f.name,
      email: f.email,
      password,
      usingBuiltInPassword: !f.password && !env.founderPassword,
    };
  });
  return { founders };
}

/**
 * Idempotently ensure both Founder (ADMIN-role) accounts EXIST so the CEO OS at
 * /founder/dashboard is reachable on a fresh deploy without running the
 * destructive seed. Runs on every boot, per founder:
 *   - account missing → create it with a hashed password;
 *   - account present → left untouched (a founder who rotated their password is
 *     never reset), except an accidentally-disabled account is re-enabled.
 * To change an existing founder's email/password, use syncFounders() (npm run
 * founders) instead — this boot path deliberately never overwrites a live login.
 * Best-effort: a failure here must never crash the API boot.
 */
export async function ensureDefaultFounder(db: Db): Promise<void> {
  const { founders } = founderDefaults();
  try {
    let created = 0;
    let usedBuiltIn = false;

    for (const founder of founders) {
      const existing = await db
        .select({ _id: users._id, disabled: users.disabled })
        .from(users)
        .where(eq(users.email, founder.email))
        .limit(1);

      if (existing.length) {
        if (existing[0].disabled) {
          await db.update(users).set({ disabled: false }).where(eq(users._id, existing[0]._id));
          console.log(`Founder account re-enabled: ${founder.email}`);
        }
        continue;
      }

      const hashed = await bcrypt.hash(founder.password, 12);
      await db.insert(users).values({
        name: founder.name,
        email: founder.email,
        password: hashed,
        role: "ADMIN",
        approvalStatus: "APPROVED",
        emailVerified: true,
        phoneVerified: true,
      });
      created++;
      if (founder.usingBuiltInPassword) usedBuiltIn = true;
      console.log(`Founder account provisioned → ${founder.name} <${founder.email}> (role: ADMIN, CEO OS at /founder/dashboard)`);
    }

    if (created > 0 && usedBuiltIn) {
      console.warn(
        "  WARNING: a founder was created with the built-in default password. Set FOUNDER1_PASSWORD / FOUNDER2_PASSWORD (or FOUNDER_PASSWORD) and rotate after first login.",
      );
    }
  } catch (err) {
    console.warn("ensureDefaultFounder skipped:", err instanceof Error ? err.message : err);
  }
}

/**
 * Create OR update both founder accounts to match the configured name / email /
 * password — the reconciling counterpart to ensureDefaultFounder(). Unlike the
 * boot path this DOES reset the password and name of an existing account, so it
 * is the tool for changing founder credentials on a live deployment. Idempotent.
 * Returns a per-founder summary of what happened.
 */
export async function syncFounders(db: Db): Promise<{ email: string; action: "created" | "updated" }[]> {
  const { founders } = founderDefaults();
  const results: { email: string; action: "created" | "updated" }[] = [];

  for (const founder of founders) {
    const hashed = await bcrypt.hash(founder.password, 12);
    const existing = await db
      .select({ _id: users._id })
      .from(users)
      .where(eq(users.email, founder.email))
      .limit(1);

    if (existing.length) {
      await db
        .update(users)
        .set({ name: founder.name, password: hashed, role: "ADMIN", disabled: false, approvalStatus: "APPROVED", emailVerified: true, phoneVerified: true })
        .where(eq(users._id, existing[0]._id));
      results.push({ email: founder.email, action: "updated" });
    } else {
      await db.insert(users).values({
        name: founder.name,
        email: founder.email,
        password: hashed,
        role: "ADMIN",
        approvalStatus: "APPROVED",
        emailVerified: true,
        phoneVerified: true,
      });
      results.push({ email: founder.email, action: "created" });
    }
  }

  return results;
}
