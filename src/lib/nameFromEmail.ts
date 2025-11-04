export function capitalize(s: string) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Best-effort first name extractor from email local-part.
 * Examples:
 *  - amina.karim@example.com -> Amina
 *  - john_doe+promo@example.com -> John
 *  - samuel123@example.com -> Samuel
 */
export function extractFirstNameFromEmail(email?: string): string {
  if (!email || !email.includes('@')) return '';

  const local = email.split('@')[0];

  // remove +plus tags and anything after (common) and remove trailing digits
  const withoutPlus = local.split('+')[0];

  // replace common separators with space
  const cleaned = withoutPlus.replace(/[._\-]+/g, ' ').replace(/[0-9]+$/, '').trim();

  // split into parts and pick the first meaningful token
  const parts = cleaned.split(' ').filter(Boolean);
  const candidate = parts[0] || cleaned;

  // if single-letter or weird, fallback to empty string
  if (!candidate || candidate.length < 2) return '';

  return capitalize(candidate);
}
