/**
 * Host-agnostic URL glob helpers shared by schema emission and runtime mock matching.
 */

export function pathnameOfUrl(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    const path = url.split("?")[0] ?? url;
    return path.startsWith("/") ? path : `/${path}`;
  }
}

/** Emit a glob that matches the pathname on any host (star-star + path + star-star). */
export function toUrlPattern(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `**${path}**`;
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/**
 * Match `urlPattern` against the full URL and against pathname so both
 * schema-generated globs and legacy bare pathnames hit recorded absolute URLs.
 */
export function matchesUrlPattern(pattern: string, url: string): boolean {
  const re = globToRegExp(pattern);
  if (re.test(url)) return true;
  const path = pathnameOfUrl(url);
  if (re.test(path)) return true;
  try {
    const parsed = new URL(url);
    if (re.test(`${parsed.origin}${parsed.pathname}`)) return true;
  } catch {
    // relative or invalid URL — pathname comparison above is the fallback
  }
  return false;
}
