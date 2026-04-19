const INTERNAL_DOMAIN = 'dispatch.internal'
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/

export function isEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)
}

export function isInternalEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`)
}

/**
 * Resolve login input (username OR real email) to an email suitable for
 * supabase.auth.signInWithPassword.
 *
 * - Real email → returned as-is (lowercased/trimmed).
 * - Legacy username → synthesized `<user>@dispatch.internal`.
 *
 * Returns null when input is neither a valid username nor a valid email.
 */
export function resolveLoginEmail(input: string): string | null {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return null
  if (isEmail(trimmed)) return trimmed
  if (USERNAME_RE.test(trimmed)) return `${trimmed}@${INTERNAL_DOMAIN}`
  return null
}

export { INTERNAL_DOMAIN, USERNAME_RE }
