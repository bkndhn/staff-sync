/** Exact project origins only; never trust a wildcard preview domain. */
export const FINGERPRINT_ORIGINS = [
  "https://zenhrapp.lovable.app",
  "https://staff-shine-sync.lovable.app",
  "https://id-preview--9244e6fb-8168-4790-a4fe-a440a7ad817c.lovable.app",
  "https://9244e6fb-8168-4790-a4fe-a440a7ad817c.lovableproject.com",
  "http://localhost:8080",
];

export function fingerprintOrigin(raw: string | null, extraOrigins = ""): string | null {
  const origin = (raw || "").replace(/\/+$/, "");
  const extra = extraOrigins.split(",").map((value) => value.trim().replace(/\/+$/, "")).filter(Boolean);
  if (![...FINGERPRINT_ORIGINS, ...extra].includes(origin)) return null;
  try {
    const url = new URL(origin);
    // A configured address must be an origin, not a URL with credentials/path/query.
    if (url.origin !== origin || (url.protocol !== "https:" && origin !== "http://localhost:8080")) return null;
    return origin;
  } catch {
    return null;
  }
}