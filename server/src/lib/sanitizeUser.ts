/**
 * Remove server-only authentication secrets from an ORM user record before
 * returning it through a general-purpose profile/session endpoint.
 * OTPs and reset codes must never be serialized to the client.
 */
export function sanitizeUserForClient<T extends { password: string; verification?: unknown }>(
  user: T,
): Omit<T, "password" | "verification"> {
  const { password: _password, verification: _verification, ...safeUser } = user;
  return safeUser;
}
