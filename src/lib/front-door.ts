// 26 Nov: the "front door" password for the whole site while it's at dev.ohsoed.co.uk (Vercel variable FRONT_PASSWORD;
// remove the variable to open the site). Shared by middleware.ts (edge) and /front-door/enter, so only Web Crypto here.
export const FRONT_COOKIE = "ose_front";
export const frontPassword = () => process.env.FRONT_PASSWORD || "";

/** The cookie a browser gets once the password is right: an HMAC keyed with the password, so changing it locks everyone out again. */
export async function frontToken(pass: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("ose-front-door")));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Only a path on this site ("/x", never "//host" or a full address). */
export const safeNext = (v: unknown) => typeof v === "string" && /^\/(?![/\\])/.test(v) && v.length < 2000 ? v : "/";
