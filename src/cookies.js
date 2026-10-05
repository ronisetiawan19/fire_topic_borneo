import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export function loadCookies(cookieFile) {
  const cookiePath = path.resolve(cookieFile);
  if (!existsSync(cookiePath)) {
    return { ok: false, error: `Cookie file not found: ${cookiePath}` };
  }
  try {
    const raw = JSON.parse(readFileSync(cookiePath, "utf-8"));
    if (!Array.isArray(raw)) {
      return { ok: false, error: "Cookie file must be a JSON array" };
    }
    const cookies = raw.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain || ".tiktok.com",
      path: c.path || "/",
      httpOnly: c.httpOnly ?? false,
      secure: c.secure ?? true,
      sameSite: c.sameSite || "Lax",
      ...(c.expires && c.expires > 0 ? { expires: c.expires } : {}),
    }));
    const names = cookies.map((c) => c.name);
    const hasSession = names.includes("sessionid");
    return { ok: true, cookies, hasSession, cookieNames: names };
  } catch (err) {
    return { ok: false, error: `Failed to parse cookie file: ${err.message}` };
  }
}