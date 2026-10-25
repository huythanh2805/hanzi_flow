/** Browser-facing origin; never derive auth redirects from an internal bind address. */
export function getSiteOrigin(configured = process.env.NEXT_PUBLIC_SITE_URL) {
  const site = new URL(configured?.trim() || "http://localhost:3000");
  if (
    !["http:", "https:"].includes(site.protocol) ||
    site.username ||
    site.password
  ) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be an HTTP(S) site URL without credentials.",
    );
  }
  if (site.hostname === "0.0.0.0" || site.hostname === "[::]")
    site.hostname = "localhost";
  return site.origin;
}

export function siteUrl(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("Site destination must be a local path.");
  }
  return new URL(path, getSiteOrigin());
}
