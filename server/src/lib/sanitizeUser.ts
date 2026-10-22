/**
 * Remove server-only authentication secrets and internal auth state from an ORM
 * user record before returning it through a general-purpose profile endpoint.
 */
export function sanitizeUserForClient<
  T extends { password: string; verification?: unknown; authVersion?: unknown },
>(user: T): Omit<T, "password" | "verification" | "authVersion"> {
  const {
    password: _password,
    verification: _verification,
    authVersion: _authVersion,
    ...safeUser
  } = user;
  return safeUser;
}
