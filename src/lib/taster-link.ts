// Book a taster from a course page (21 Nov): /taster?level=KS3&subject=English%20Literature opens the form with the course
// already chosen, so the parent only picks a date and time. The address survives registering or signing in first.

/** A safe "/taster…" address (only level and subject kept), or null if it isn't one. "taster" means plain /taster. */
export function safeTaster(next: string | null | undefined): string | null {
  if (!next) return null;
  if (next === "taster" || next === "/taster") return "/taster";
  if (!next.startsWith("/taster?") || next.length > 300) return null;
  const p = new URLSearchParams(next.slice("/taster?".length)), out = new URLSearchParams();
  for (const k of ["level", "subject"]) { const v = (p.get(k) ?? "").trim(); if (v && v.length <= 60 && /^[\p{L}\p{N} &'’().,/-]+$/u.test(v)) out.set(k, v); }
  for (const k of ["child", "push"]) { const v = (p.get(k) ?? "").trim(); if (/^[0-9a-f-]{36}$/i.test(v)) out.set(k, v); }   // 28 Nov: from a Fill a class email
  return out.size ? `/taster?${out.toString()}` : "/taster";
}
/** The taster address for one course. */
export const tasterHref = (level: string, subject: string) => `/taster?${new URLSearchParams({ level, subject }).toString()}`;
