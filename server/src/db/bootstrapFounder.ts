import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Db } from "./index";
import { users } from "./schema";
import { DEFAULT_FOUNDER_PASSWORD, getEnv } from "../config/env";

/**
 * Resolved default-Founder credentials: env overrides, else strong built-ins.
 * `usingBuiltInPassword` is true when no FOUNDER_PASSWORD was supplied, so
 * callers can warn about the shipped default.
 */
export function founderDefaults() {
  const env = getEnv();
  const password = env.founderPassword || DEFAULT_FOUNDER_PASSWORD;
  return {
    name: env.founderName,
    email: env.founderEmail,
    password,
    usingBuiltInPassword: !env.founderPassword,
  };
}

/**
 * Idempotently ensure a Founder (ADMIN-role) account exists so the CEO OS at
 * /founder/dashboard is reachable on a fresh deploy without running the
 * destructive seed. Runs on every boot:
 *   - account missing → create it with a strong, hashed password;
 *   - account present → left untouched (a Founder who rotated their password
 *     is never reset).
 * Best-effort: a failure here must never crash the API boot.
 */
export async function ensureDefaultFounder(db: Db): Promise<void> {
  const f = founderDefaults();
  try {
    const existing = await db
      .select({ _id: users._id, disabled: users.disabled })
      .from(users)
      .where(eq(users.email, f.email))
      .limit(1);

    if (existing.length) {
      // Never clobber a real, in-use account. Just make sure a pre-existing
      // Founder can always sign in (undo an accidental deactivation).
      if (existing[0].disabled) {
        await db.update(users).set({ disabled: false }).where(eq(users._id, existing[0]._id));
        console.log(`Default Founder account re-enabled: ${f.email}`);
      }
      return;
    }

    const hashed = await bcrypt.hash(f.password, 12);
    await db.insert(users).values({
      name: f.name,
      email: f.email,
      password: hashed,
      role: "ADMIN",
      approvalStatus: "APPROVED",
      emailVerified: true,
      phoneVerified: true,
    });

    console.log(`Default Founder account provisioned → ${f.email} (role: ADMIN, CEO OS at /founder/dashboard)`);
    if (f.usingBuiltInPassword) {
      console.warn(
        "  WARNING: using the built-in default Founder password. Set FOUNDER_PASSWORD in the environment and rotate it after first login.",
      );
    }
  } catch (err) {
    console.warn("ensureDefaultFounder skipped:", err instanceof Error ? err.message : err);
  }
}
