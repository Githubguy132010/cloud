/** Strip surrounding quotes; bun build --define can wrap values in extra quotes. */
export function cleanVersion(version: string | null | undefined): string | null {
  return version?.trim().replace(/^["']|["']$/g, '') || null;
}

/** Returns true if calver `version` is >= `minVersion` (e.g. "2026.2.26"). Fails closed on malformed input. */
export function calverAtLeast(version: string | null | undefined, minVersion: string): boolean {
  const parts = parseCalver(version);
  const minParts = parseCalver(minVersion);
  if (!parts || !minParts) return false;

  for (let i = 0; i < minParts.length; i++) {
    const a = parts[i];
    const b = minParts[i];
    if (a > b) return true;
    if (a < b) return false;
  }

  return true;
}

function parseCalver(version: string | null | undefined): [number, number, number] | null {
  const cleaned = cleanVersion(version);
  if (!cleaned) return null;

  const match = cleaned.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
    return null;
  }

  return [major, minor, patch];
}
