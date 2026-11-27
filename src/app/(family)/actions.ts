"use server";
import { cookies } from "next/headers";
import { threadFields } from "@/lib/chat-threads";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { sendSignInLink, redeemSignInLink, actingParent, actingStudent, familySignOut, currentFamily } from "@/lib/family-auth";
import * as F from "@/lib/family";
import { siteBase } from "@/lib/social";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const go = (path: string, ok?: string | null, err?: string | null): never => redirect(path + (path.includes("?") ? "&" : "?") + (err ? `err=${encodeURIComponent(err)}` : `ok=${encodeURIComponent(ok ?? "Saved.")}`));
const VIEWING = "You’re viewing as this family, so nothing can be changed or sent.";
async function parent(back: string) { try { return await actingParent(); } catch { return go(back, null, VIEWING); } }
async function student(back: string) { try { return await actingStudent(); } catch { return go(back, null, VIEWING); } }
/** Beta (26 Nov): pause this action while Beta is on, with a note on the page it came from. */
async function beta(back: string, why: keyof typeof import("@/lib/test-mode").BETA) {
  const t = await import("@/lib/test-mode");
  if (await t.betaOn()) go(back, null, t.BETA[why]);
}

/** Where a parent was heading when they went to sign in or register (only the taster page so far), kept for an hour. */
const NEXT_COOKIE = "ose_next";
export async function rememberNext(next: string) {
  const join = /^\/join\/[0-9a-f-]{36}$/i.test(next) ? next : null;   // back to the lesson after signing in (5 Nov)
  const taster = (await import("@/lib/taster-link")).safeTaster(next);   // the taster form, with the course chosen on its page (21 Nov)
  if (taster || join) (await cookies()).set(NEXT_COOKIE, join ?? taster!, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 3600, secure: process.env.VERCEL === "1" });
}
export async function sendLinkAction(f: FormData): Promise<void> {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("x-forwarded-host") || h.get("host")}`;
  const err = await sendSignInLink(str(f, "email", 200), await siteBase(origin));
  await rememberNext(str(f, "next", 300));
  redirect(err ? `/account?err=${encodeURIComponent(err)}` : "/account?sent=1");
}
export async function redeemLinkAction(f: FormData): Promise<void> {
  const kind = await redeemSignInLink(str(f, "t", 100));
  const { cartCodes } = await import("@/lib/cart");
  const jar = await cookies(), back = jar.get(NEXT_COOKIE)?.value; if (back) jar.delete(NEXT_COOKIE);
  redirect(kind === "parent" ? (back?.startsWith("/taster") ? ((await import("@/lib/taster-link")).safeTaster(back) ?? "/taster") : (await cartCodes()).length ? "/cart" : "/parent") : kind === "student" ? (back?.startsWith("/join/") ? back : "/student") : "/account?expired=1");
}
export async function familySignOutAction(): Promise<void> {
  const f = await currentFamily();
  await familySignOut();
  redirect(f?.viewer ? "/admin" : "/account?out=1");
}

// ---------- parent ----------
export async function reportAbsenceAction(f: FormData): Promise<void> {
  const p = await parent("/parent/attendance");
  const err = await F.reportAbsences(p.id, str(f, "student", 40), f.getAll("lesson").map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x)), str(f, "reason", 60), str(f, "note", 500) || null);
  go("/parent/attendance", "Absence reported. The teacher can see it, and it doesn’t count against attendance.", err);
}
export async function cancelAbsenceAction(f: FormData): Promise<void> {
  const p = await parent("/parent/attendance");
  await F.cancelAbsence(p.id, str(f, "id", 40));
  go("/parent/attendance", "Absence cancelled.");
}
export async function bookWorkshopAction(f: FormData): Promise<void> {
  const p = await parent("/parent/workshops");
  await beta("/parent/workshops", "booking");
  const err = await F.bookFreeWorkshop(p.id, str(f, "workshop", 40), str(f, "student", 40));
  go("/parent/workshops", "Booked. The Google Meet invitation goes to your child’s Google account.", err);
}
export async function parentReplyAction(f: FormData): Promise<void> {
  const id = str(f, "id", 40), p = await parent(`/parent/messages?t=${id}`);
  await beta(`/parent/messages?t=${id}`, "teacherMsg");
  const body = str(f, "body", 5000);
  const err = body ? await F.parentReply(p.id, id, body) : "Write a message first.";
  go(`/parent/messages?t=${id}`, "Sent.", err);
}
export async function parentStartAction(f: FormData): Promise<void> {
  const p = await parent("/parent/messages?new=1");
  const [student, group] = str(f, "to", 80).split("|"), subject = str(f, "subject", 120), body = str(f, "body", 5000);
  // 24 Nov: "office|<child>" writes to the office (always possible; the only choice while teacher messages are switched off)
  if (student === "office") {
    if (!subject || !body) go("/parent/messages?new=1", null, "Write a subject and a message.");
    const { startMyOfficeThread } = await import("@/lib/office-messages");
    const r = await startMyOfficeThread("parent", p.id, subject, String(f.get("body") ?? ""), group || null);
    if (r.error) go("/parent/messages?new=1", null, r.error);
    go(`/parent/messages?o=${r.id}`, "Sent to the office. They’ll reply here.");
  }
  await beta("/parent/messages?new=1", "teacherMsg");
  const { familyMsgsOn } = await import("@/lib/teacher-area");
  if (!(await familyMsgsOn())) go("/parent/messages?new=1", null, "Messages to teachers are switched off for now. Choose “The office” and they’ll pass it on.");
  if (!subject || !body || !student || !group) go("/parent/messages?new=1", null, "Choose a teacher and write a subject and message.");
  const r = await F.parentStartThread(p.id, student, group, subject, body);
  if (r.error) go("/parent/messages?new=1", null, r.error);
  go(`/parent/messages?t=${r.id}`, "Sent. The teacher will reply here, and the office can read the conversation.");
}
export async function acceptsContactAction(f: FormData): Promise<void> {
  const p = await parent("/parent/connect");
  await F.setAcceptsContact(p.id, f.get("on") === "on");
  go("/parent/connect", "Saved. Your choice is recorded with today’s date.");
}
export async function requestContactAction(f: FormData): Promise<void> {
  const p = await parent("/parent/connect");
  await beta("/parent/connect", "contact");
  const [to_parent, to_student, from_student, group] = str(f, "who", 200).split("|");
  const err = await F.requestContact(p.id, { to_parent, to_student, from_student, group, message: str(f, "message", 300) || null });
  go("/parent/connect", "Request sent. You’ll see their details here if they accept.", err);
}
export async function respondContactAction(f: FormData): Promise<void> {
  const p = await parent("/parent/connect");
  await beta("/parent/connect", "contact");
  const a = str(f, "answer", 10);
  await F.respondContact(p.id, str(f, "id", 40), a === "accept", a === "block");
  go("/parent/connect", a === "accept" ? "Accepted: you can now see each other’s name and email." : "Declined.");
}
export async function saveDetailsAction(f: FormData): Promise<void> {
  const p = await parent("/parent/details");
  await F.saveDetails(p.id, { phone: str(f, "phone", 40) || null, address: str(f, "address", 300) || null });
  revalidatePath("/parent/details"); go("/parent/details", "Your details are saved.");
}
export async function saveGuardianAction(f: FormData): Promise<void> {
  const p = await parent("/parent/details");
  const err = f.get("remove") ? await F.saveGuardian(p.id, null) : await F.saveGuardian(p.id, { first: str(f, "first", 60), last: str(f, "last", 60), email: str(f, "email", 120).toLowerCase(),
    relationship: str(f, "relationship", 20) || "Parent", invoices: f.get("invoices") === "on", reports: f.get("reports") === "on", marketing: f.get("marketing") === "on" });
  go("/parent/details", f.get("remove") ? "Second parent removed." : "Second parent saved.", err);
}
export async function saveChildAction(f: FormData): Promise<void> {
  const p = await parent("/parent/details");
  const chat = ["none", "class", "class_and_private"].includes(str(f, "chat", 20)) ? str(f, "chat", 20) : "none";
  const err = await F.saveChild(p.id, str(f, "student", 40), { email: f.has("email") ? str(f, "email", 120).toLowerCase() : null, chat, leaderboard: f.get("leaderboard") === "on" ? "first_initial" : "hidden",
    share: f.has("share_present") ? f.get("share") === "on" : null, agree: f.get("agree_rules") === "on",
    gender: f.has("gender") ? (["Male", "Female", "Non-binary", "Prefer not to answer"].includes(str(f, "gender", 30)) ? str(f, "gender", 30) : "") : undefined });
  go("/parent/details", "Saved. Your choices are recorded with today’s date.", err);
}
export async function marketingAction(f: FormData): Promise<void> {
  const p = await parent("/parent/privacy");
  await F.setMarketing(p.id, f.get("on") === "on");
  go("/parent/privacy", "Saved. Your choice is recorded with today’s date.");
}
export async function privacyRequestAction(f: FormData): Promise<void> {
  const p = await parent("/parent/privacy");
  const kind = str(f, "kind", 20), err = await F.privacyRequest(p.id, p.email, kind);
  go("/parent/privacy", kind === "access" ? "Request sent. We’ll email you a secure download within one month, usually much sooner." : "Request sent. We’ll reply within one month.", err);
}

// ---------- student ----------
export async function studentPostAction(f: FormData): Promise<void> {
  const chat = str(f, "chat", 40), s = await student(`/student/chat?c=${chat}`);
  await beta(`/student/chat?c=${chat}`, "chat");
  const body = str(f, "body", 1000), th = threadFields(f);
  const err = body ? await F.studentPost(s.id, chat, body, th) : "Write a message first.";
  redirect(`/student/chat?c=${chat}${th.parent ? `&t=${th.parent}` : ""}${err ? `&err=${encodeURIComponent(err)}` : ""}`);
}
export async function startDirectAction(f: FormData): Promise<void> {
  const s = await student("/student/chat");
  await beta("/student/chat", "chat");
  const r = await F.startDirect(s.id, str(f, "with", 40));
  redirect(r.id ? `/student/chat?c=${r.id}` : `/student/chat?err=${encodeURIComponent(r.error ?? "Couldn’t start that chat.")}`);
}
export async function reportMessageAction(f: FormData): Promise<void> {
  const chat = str(f, "chat", 40), s = await student(`/student/chat?c=${chat}`);
  await F.reportMessage(s.id, str(f, "id", 40));
  const t = str(f, "t", 40);
  redirect(`/student/chat?c=${chat}${/^[0-9a-f-]{36}$/.test(t) ? `&t=${t}` : ""}&ok=${encodeURIComponent("Thanks. The office will look at it.")}`);
}
export async function requestOneAction(f: FormData): Promise<void> {
  const p = await parent("/parent/book");
  await beta("/parent/book", "booking");
  const [teacher, at] = str(f, "slot", 80).split("|");
  const err = await F.requestOne(p.id, str(f, "student", 40), str(f, "subject", 40), teacher, at, str(f, "focus", 300) || null);
  go("/parent/book", "Request sent. We’ll confirm the time by email and take payment then.", err);
}
export async function parentCancelAction(f: FormData): Promise<void> {
  const p = await parent("/parent/payments");
  await beta("/parent/payments", "change");
  const err = await F.parentCancel(p.id, str(f, "id", 40));
  go("/parent/payments", "Cancelled with notice. Lessons and payments continue to the end of the notice period. We’ve recorded it with today’s date.", err);
}
export async function parentSwapAction(f: FormData): Promise<void> {
  const p = await parent("/parent/payments");
  await beta("/parent/payments", "change");
  const start = str(f, "start", 8) === "next" ? "next" : "current";
  const err = await F.parentSwap(p.id, str(f, "id", 40), str(f, "to", 40), start);
  go("/parent/payments", start === "next" ? "Swap booked: the new class starts next term." : "Swapped: your child moves now. The new course is charged for its lessons from the start of this term, less what you’d already paid for this term.", err);
}

// ---------- replies to messages from the office (5 Nov) ----------
export async function familyOfficeReplyAction(f: FormData): Promise<void> {
  const id = str(f, "id", 40), kind = f.get("kind") === "student" ? "student" : "parent", page = `/${kind}/messages?o=${encodeURIComponent(id)}`;
  const who = kind === "student" ? await student(page) : await parent(page);
  const { myOfficeReply } = await import("@/lib/office-messages");
  const err = await myOfficeReply(kind, who.id, id, String(f.get("body") ?? "").replace(/\r\n/g, "\n"));
  go(page, "Sent to the office.", err);
}

// ---------- 11 Nov: how the family pays each term (Direct Debit, or card when the office allows it) ----------
export async function startPayMethodAction(f: FormData): Promise<void> {
  const p = await parent("/parent/payments");
  await beta("/parent/payments", "change");
  const { payAccess, startSetup } = await import("@/lib/stripe-pay");
  if (!(await payAccess(p.email))) go("/parent/payments", null, "Online payments aren’t open yet.");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("x-forwarded-host") || h.get("host")}`;
  const r = await startSetup(p.id, str(f, "kind", 10) === "card" ? "card" : "bacs", await siteBase(origin));
  if (r.error || !r.url) go("/parent/payments", null, r.error ?? "Couldn’t open Stripe.");
  redirect(r.url!);
}

// ---------- 27 Nov (Alfonso): Messages and Email work like the admin's ----------
/** "Mark unread" on a conversation: the latest message from the teacher or the office counts as unread again. */
export async function parentMarkUnreadAction(f: FormData): Promise<void> {
  const p = await parent("/parent/messages");
  const id = str(f, "id", 40), kind = str(f, "kind", 10), tab = str(f, "f", 10);
  const back = `/parent/messages${/^(unread|office|teachers)$/.test(tab) ? `?f=${tab}` : ""}`;
  if (!p.viewer && /^[0-9a-f-]{36}$/.test(id)) {
    const { withSchool } = await import("@/lib/db");
    if (kind === "office") await withSchool((q) => q(`update office_messages set read_at = null where id = (select m.id from office_messages m join office_threads th on th.id = m.thread_id
      where th.id = $1 and th.to_kind = 'parent' and th.parent_id = $2 and m.sender = 'office' order by m.created_at desc limit 1)`, [id, p.id])).catch(() => null);
    else await withSchool((q) => q(`update messages set read_by_parent_at = null where id = (select m.id from messages m join message_threads th on th.id = m.thread_id
      where th.id = $1 and th.parent_id = $2 and m.sender <> 'parent' order by m.created_at desc limit 1)`, [id, p.id])).catch(() => null);
  }
  redirect(back);
}
/** Email: "Mark unread" / "Mark all read". */
export async function parentEmailReadAction(f: FormData): Promise<void> {
  const p = await parent("/parent/email");
  const id = str(f, "id", 40), all = f.get("all") === "1", show = str(f, "show", 5);
  if (!p.viewer) {
    const { withSchool } = await import("@/lib/db");
    if (all) await withSchool((q) => q(`update email_log set read_at = now() where to_email = $1 and read_at is null`, [p.email.toLowerCase()])).catch(() => null);
    else if (/^\d+$/.test(id)) await withSchool((q) => q(`update email_log set read_at = null where id = $1 and to_email = $2`, [id, p.email.toLowerCase()])).catch(() => null);
  }
  redirect(`/parent/email${show === "all" ? "?show=all" : ""}`);
}
