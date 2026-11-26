import "server-only";
import { after } from "next/server";
import { activeSchool, runAsSchool } from "./db";

// 26 Nov: work that can happen after the page has been sent (e.g. re-reading Google Classroom for My day), run as the
// same school. One run per key at a time on this server, so several page loads don't all ask Google at once.
const running = new Set<string>();
export async function inBackground(key: string, fn: () => Promise<unknown>): Promise<void> {
  if (running.has(key)) return;
  const slug = await activeSchool();
  running.add(key);
  const job = () => runAsSchool(slug, fn).catch((e) => console.error("background", key, e)).finally(() => running.delete(key));
  try { after(job); }
  catch { await job(); }   // outside a request: just do it now
}
