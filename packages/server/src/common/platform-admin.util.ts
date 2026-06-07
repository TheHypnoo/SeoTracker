/**
 * Platform administrators are operators of SEOTracker itself, designated by the
 * `PLATFORM_ADMIN_EMAILS` env allowlist. This is intentionally orthogonal to the
 * per-project OWNER/MEMBER/VIEWER permission model: a project owner is NOT a
 * platform admin. Used to gate internal observability (engine health) so the
 * engine's performance internals are never exposed to customers.
 */
export function parsePlatformAdminEmails(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

export function isPlatformAdmin(email: string | undefined, raw: string | undefined): boolean {
  if (!email) return false;
  return parsePlatformAdminEmails(raw).has(email.toLowerCase());
}
