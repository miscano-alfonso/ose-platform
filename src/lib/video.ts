// Live lessons can run in any video tool. Classes keep their Google Classroom; the lesson link can be
// Google Meet, Zoom, Microsoft Teams, Whereby, Jitsi or any other https link. Safe to import on the client.

export type VideoId = "meet" | "zoom" | "teams" | "whereby" | "jitsi" | "other";
export type VideoTool = { id: VideoId; name: string; host: RegExp | null; example: string; auto: string };

export const VIDEO_TOOLS: VideoTool[] = [
  { id: "meet", name: "Google Meet", host: /(^|\.)meet\.google\.com$/i, example: "https://meet.google.com/abc-defg-hij", auto: "from Google Meet’s own log (needs Google Workspace), plus check-ins if they’re on" },
  { id: "zoom", name: "Zoom", host: /(^|\.)zoom\.(us|com)$/i, example: "https://us02web.zoom.us/j/12345678901", auto: "from Zoom’s list of who joined once Zoom is connected (below), plus check-ins if they’re on" },
  { id: "teams", name: "Microsoft Teams", host: /(^|\.)teams\.(microsoft|live)\.com$/i, example: "https://teams.microsoft.com/l/meetup-join/…", auto: "from check-ins" },
  { id: "whereby", name: "Whereby", host: /(^|\.)whereby\.com$/i, example: "https://whereby.com/your-room", auto: "from check-ins" },
  { id: "jitsi", name: "Jitsi Meet", host: /(^|\.)(meet\.jit\.si|8x8\.vc)$/i, example: "https://meet.jit.si/YourRoom", auto: "from check-ins" },
  { id: "other", name: "Another video tool", host: null, example: "https://…", auto: "from check-ins" },
];
export const toolById = (id: string | null | undefined) => VIDEO_TOOLS.find((t) => t.id === id) ?? VIDEO_TOOLS[0];

/** Which tool a lesson link belongs to, from its address. */
export function toolOf(url: string | null | undefined): VideoTool {
  if (!url) return VIDEO_TOOLS[VIDEO_TOOLS.length - 1];
  try { const h = new URL(url).hostname; return VIDEO_TOOLS.find((t) => t.host?.test(h)) ?? VIDEO_TOOLS[VIDEO_TOOLS.length - 1]; }
  catch { return VIDEO_TOOLS[VIDEO_TOOLS.length - 1]; }
}
/** "Join Google Meet", "Join Zoom", or "Join the lesson" for other tools. */
export const joinLabel = (url: string | null | undefined) => { const t = toolOf(url); return t.id === "other" ? "Join the lesson" : `Join ${t.name}`; };

/** A lesson link as saved: Meet links tidied (no tracking bits), any other https link kept as typed.
 *  "" clears it; undefined means it isn't a usable link. */
export function cleanLessonLink(raw: string): string | null | undefined {
  const s = raw.trim();
  if (s === "") return null;
  if (/^https:\/\/meet\.google\.com\/[a-z]{3}-?[a-z]{4}-?[a-z]{3}\b/i.test(s)) return s.split("?")[0];
  try { const u = new URL(s); if (u.protocol !== "https:" || !u.hostname.includes(".") || s.length > 500) return undefined; return u.toString(); }
  catch { return undefined; }
}

/** The school's live-lesson settings (Admin → School settings → Live lessons). */
export type VideoSettings = { tool: VideoId; checkins: boolean };
export const DEFAULT_VIDEO: VideoSettings = { tool: "meet", checkins: false };
