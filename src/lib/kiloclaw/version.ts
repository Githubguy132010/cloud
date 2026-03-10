/** Returns true if calver `version` is >= `minVersion` (e.g. "2026.2.26"). Fails closed on malformed input. */
export function calverAtLeast(
  version: string | null | undefined,
  minVersion: string
): boolean {
  if (!version) return false;

  const parts = version.split('.').map(Number);
  const minParts = minVersion.split('.').map(Number);

  for (let i = 0; i < minParts.length; i++) {
    const a = parts[i] ?? 0;
    const b = minParts[i] ?? 0;
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    if (a > b) return true;
    if (a < b) return false;
  }

  return true;
}
