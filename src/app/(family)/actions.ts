"use server";
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

export async function sendLinkAction(f: FormData): Promise<void> {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("x-forwarded-host") || h.get("host")}`;
  const err = await sendSignInLink(str(f, "email", 200), await siteBase(origin));
  redirect(err ? `/account?err=${encodeURIComponent(err)}` : "/account?sent=1");
}
export async function redeemLinkAction(f: FormData): Promise<void> {
  const kind = await redeemSignInLink(str(f, "t", 100));
  const { cartCodes } = await import("@/lib/cart");
  redirect(kind === "parent" ? ((await cartCodes()).length ? "/cart" : "/parent") : kind === "student" ? "/student" : "/account?expired=1");
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
  const err = await F.bookFreeWorkshop(p.id, str(f, "workshop", 40), str(f, "student", 40));
  go("/parent/workshops", "Booked. The Google Meet invitation goes to your child’s Google account.", err);
}
export async function parentReplyAction(f: FormData): Promise<void> {
  const id = str(f, "id", 40), p = await parent(`/parent/messages?t=${id}`);
  const body = str(f, "body", 5000);
  const err = body ? await F.parentReply(p.id, id, body) : "Write a message first.";
  go(`/parent/messages?t=${id}`, "Sent.", err);
}
export async function parentStartAction(f: FormData): Promise<void> {
  const p = await parent("/parent/messages?new=1");
  const [student, group] = str(f, "to", 80).split("|"), subject = str(f, "subject", 120), body = str(f, "body", 5000);
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
  const [to_parent, to_student, from_student, group] = str(f, "who", 200).split("|");
  const err = await F.requestContact(p.id, { to_parent, to_student, from_student, group, message: str(f, "message", 300) || null });
  go("/parent/connect", "Request sent. You’ll see their details here if they accept.", err);
}
export async function respondContactAction(f: FormData): Promise<void> {
  const p = await parent("/parent/connect");
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
    share: f.has("share_present") ? f.get("share") === "on" : null, agree: f.get("agree_rules") === "on" });
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
  const body = str(f, "body", 1000), th = threadFields(f);
  const err = body ? await F.studentPost(s.id, chat, body, th) : "Write a message first.";
  redirect(`/student/chat?c=${chat}${th.parent ? `&t=${th.parent}` : ""}${err ? `&err=${encodeURIComponent(err)}` : ""}`);
}
export async function startDirectAction(f: FormData): Promise<void> {
  const s = await student("/student/chat");
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
  const [teacher, at] = str(f, "slot", 80).split("|");
  const err = await F.requestOne(p.id, str(f, "student", 40), str(f, "subject", 40), teacher, at, str(f, "focus", 300) || null);
  go("/parent/book", "Request sent. We’ll confirm the time by email and take payment then.", err);
}
export async function parentCancelAction(f: FormData): Promise<void> {
  const p = await parent("/parent/payments");
  const err = await F.parentCancel(p.id, str(f, "id", 40));
  go("/parent/payments", "Cancelled with notice. Lessons and payments continue to the end of the notice period. We’ve recorded it with today’s date.", err);
}
export async function parentSwapAction(f: FormData): Promise<void> {
  const p = await parent("/parent/payments");
  const start = str(f, "start", 8) === "next" ? "next" : "current";
  const err = await F.parentSwap(p.id, str(f, "id", 40), str(f, "to", 40), start);
  go("/parent/payments", start === "next" ? "Swap booked: the new class starts next term." : "Swapped: your child moves now and this term is re-priced.", err);
}
