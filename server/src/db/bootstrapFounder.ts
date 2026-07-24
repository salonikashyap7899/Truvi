import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Db } from "./index";
import { users } from "./schema";
import { DEFAULT_FOUNDER_PASSWORD, getEnv } from "../config/env";

/**
 * Resolved Founder credentials: the two founders (Sandeep & Meeraj) plus the
 * shared password (env override, else the strong built-in default).
 * `usingBuiltInPassword` is true when no FOUNDER_PASSWORD was supplied, so
 * callers can warn about the shipped default.
 */
export function founderDefaults() {
  const env = getEnv();
  const password = env.founderPassword || DEFAULT_FOUNDER_PASSWORD;
  return {
    password,
    usingBuiltInPassword: !env.founderPassword,
    founders: env.founders,
  };
}

/**
 * Idempotently ensure both Founder (ADMIN-role) accounts exist so the CEO OS at
 * /founder/dashboard is reachable on a fresh deploy without running the
 * destructive seed. Runs on every boot, per founder:
 *   - account missing → create it with a strong, hashed password;
 *   - account present → left untouched (a founder who rotated their password is
 *     never reset), except an accidentally-disabled account is re-enabled.
 * Best-effort: a failure here must never crash the API boot.
 */
export async function ensureDefaultFounder(db: Db): Promise<void> {
  const f = founderDefaults();
  try {
    const hashed = await bcrypt.hash(f.password, 12);
    let created = 0;

    for (const founder of f.founders) {
      const existing = await db
        .select({ _id: users._id, disabled: users.disabled })
        .from(users)
        .where(eq(users.email, founder.email))
        .limit(1);

      if (existing.length) {
        // Never clobber a real, in-use account. Just make sure a pre-existing
        // founder can always sign in (undo an accidental deactivation).
        if (existing[0].disabled) {
          await db.update(users).set({ disabled: false }).where(eq(users._id, existing[0]._id));
          console.log(`Founder account re-enabled: ${founder.email}`);
        }
        continue;
      }

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
      console.log(`Founder account provisioned → ${founder.name} <${founder.email}> (role: ADMIN, CEO OS at /founder/dashboard)`);
    }

    if (created > 0 && f.usingBuiltInPassword) {
      console.warn(
        "  WARNING: founders are using the built-in default password. Set FOUNDER_PASSWORD in the environment and rotate it after first login.",
      );
    }
  } catch (err) {
    console.warn("ensureDefaultFounder skipped:", err instanceof Error ? err.message : err);
  }
}
