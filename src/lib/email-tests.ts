import "server-only";
import { withSchool } from "./db";
import { sendOne, sendHtml, sendBatch, type Recipient } from "./email";
import { automations, testAutomation } from "./automations";
import { simplePage, schoolLook } from "./newsletter";
import { testMode } from "./test-mode";

// Admin → Automations → "Send every email as a test" (31 Oct): one example of every email the system sends by itself, to one address,
// each marked [Test] and filled with made-up details (Sam, KS3 Maths…). The wording matches what the system sends; the automations use
// the school's saved wording. Nothing is sent to any family, student or teacher.
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export async function sendAllTests(to: Recipient): Promise<{ sent: string[]; failed: string[]; error?: string }> {
  // never to a family, student or teacher; in test mode, only to an address test mode lets through (admins and the allowed list)
  const addr = to.email.trim().toLowerCase();
  const family = await withSchool((q) => q(`select 1 from parents where lower(email::text) = $1 union all select 1 from students where lower(email::text) = $1
    union all select 1 from users u join teachers t on t.user_id = u.id where lower(u.email::text) = $1 and u.role <> 'school_admin'`, [addr]));
  if (family.length) return { sent: [], failed: [], error: `${addr} belongs to a family, student or teacher, so tests aren’t sent there.` };
  const t = await testMode();
  if (t.on && ![...t.admins, ...t.allow.map((x) => x.trim().toLowerCase())].includes(addr))
    return { sent: [], failed: [], error: `Test mode is on and ${addr} isn’t one of the admins or on the allowed list. Add it on Admin → Test mode, then send again.` };
  const school = (await withSchool((q) => q<{ name: string }>(`select name from schools where id = current_school()`)))[0]?.name ?? "OH-SO ED";
  const base = (process.env.SITE_URL || "https://ose.miscano.co.uk").replace(/\/$/, "");
  const first = to.name.split(" ")[0] || "there";
  const sent: string[] = [], failed: string[] = [];
  const log = (name: string, r: { ok: boolean; error?: string } | { sent: number; error?: string }) => { if ("ok" in r ? r.ok : r.sent > 0) sent.push(name); else failed.push(r.error ? `${name} (${r.error})` : name); };
  const T = (s: string) => `[Test] ${s}`;

  // 1–8: the automations, with the school's own wording from Admin → Automations
  for (const a of (await automations()).rows) log(`Automation: ${a.name}`, await testAutomation(a.key, to, { subject: a.subject, body: a.body }));

  // 9: parent / student sign-in link
  log("Sign-in link", await sendOne([to], T(`Your ${school} sign-in link`),
    `Hello ${first},\n\nUse this link to sign in to your ${school} account. It works once, for the next 30 minutes:\n\n${base}/account/sign-in?t=EXAMPLE\n\nIf you didn’t ask for it, you can ignore this email.\n\n${school}`, { tag: "email-test" }));

  // 9b: new parent: confirm your email to finish registering
  log("Registration: confirm your email", await sendOne([to], T(`Confirm your email to finish registering with ${school}`),
    `Hello ${first},\n\nThank you for registering with ${school}. Please confirm your email address to finish setting up your account:\n\n${base}/account/sign-in?t=EXAMPLE\n\nThe link works once, for the next 24 hours, and signs you in. Your basket will be waiting for you.\n\nIf you didn’t register, you can ignore this email and the account won’t be used.\n\n${school}`, { tag: "email-test" }));

  // 10: taster booked (website taster form)
  log("Taster booked confirmation", await sendHtml(T("Sam’s taster lesson is booked"), `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1f3d;max-width:600px">
    <p>Hello ${esc(first)},</p><p>Thank you for booking a free taster lesson for <b>Sam Example</b> at ${esc(school)}. Here’s what’s booked:</p>
    <table style="border-collapse:collapse;width:100%;border:1px solid #e7e9f3;border-radius:8px"><tr><td style="padding:10px 12px;border-top:1px solid #e7e9f3"><b>KS3 Maths</b><br>Tuesday 10 November, 16:00–16:45<br>with Becky Randle</td>
    <td style="padding:10px 12px;border-top:1px solid #e7e9f3;white-space:nowrap">Classroom access until<br><b>Tuesday 24 November</b></td></tr></table>
    <p style="margin-top:18px"><b>Before the lesson:</b> Sam will receive a Google Classroom invitation for each class at <b>sam.example@gmail.com</b>. Please open it and press <b>Join</b>. Lessons run in Google Meet, and the link is in the class’s Classroom.</p>
    <p>If anything changes, just reply to this email.</p><p>See you soon,<br>${esc(school)}</p></div>`, [to.email], "email-test"));

  // 11: after a taster (sent by the office from Admin → Tasters)
  log("Taster follow-up", await sendHtml(T("How did Sam’s taster go?"), `<p>Dear ${esc(first)},</p><p>Thank you for bringing Sam to the KS3 Maths taster lesson. We hope they enjoyed it.</p>
    <p>If you’d like Sam to join the class, you can book a place here: <a href="${base}/courses">${base}/courses</a>. Places are limited, so do get in touch if you have any questions.</p><p>Best wishes,<br>${esc(school)}</p>`, [to.email], "email-test"));

  // 12: Google Classroom invitation reminder
  log("Classroom invitation reminder", await sendHtml(T("Sam: please accept the KS3 Maths Google Classroom invitation"), `<p>Hello Sam (and ${esc(first)}),</p>
    <p>Sam has been invited to the <b>KS3 Maths</b> Google Classroom at sam.example@gmail.com. Please open <a href="https://classroom.google.com/">classroom.google.com</a> signed in with that Google account and press <b>Join</b>. Until then Sam can’t join the lesson’s Google Meet.</p>
    <p>Best wishes,<br>${esc(school)}</p>`, [to.email], "email-test"));

  // 13: newsletter sign-up confirmation (website footer)
  const look = await schoolLook();
  log("Newsletter confirmation", await sendHtml(T(`Please confirm your subscription to ${look.school}`), simplePage(base, "Confirm your subscription",
    `Thanks for signing up to hear about space in our classes, new courses and workshops from ${look.school}. Please confirm it’s you. If you didn’t sign up, just ignore this email and you won’t hear from us.`, "Yes, subscribe me", `${base}/newsletter/confirm?t=EXAMPLE`, true, look), [to.email], "email-test"));

  // 14: teachers: report comments still to write
  log("Report comments reminder (teachers)", await sendHtml(T("Term 1 Progress Report: 4 comments to write by Friday 13 November"), `<p>Hello ${esc(first)},</p><p>You have 4 report comments still to write for the Term 1 Progress Report. They’re due by Friday 13 November.</p><p>Sign in and open <b>Reports to write</b> to finish them.</p><p>Thank you,<br>${esc(school)}</p>`, [to.email], "email-test"));

  // 15: office: attendance alert
  log("Attendance alert (office)", await sendHtml(T("Attendance below 50%: 2 students"), `<p>2 students are below 50% attendance this term (from Google Meet).</p><table cellpadding="6" style="border-collapse:collapse">
    <tr><th align="left">Student</th><th align="left">Level</th><th align="right">Attendance</th></tr><tr><td>Sam Example</td><td>KS3</td><td align="right">40% of 10</td></tr><tr><td>Alex Example</td><td>iGCSE</td><td align="right">45% of 11</td></tr></table>
    <p>See Admin → Attendance for each lesson.</p>`, [to.email], "email-test"));

  // 16: office: student chat safety alert
  log("Chat safety alert (office)", await sendHtml(T("Chat alert: personal details (Sam Example)"), `<p>Sam Example tried to send a message that matched: <b>Personal details</b> (it was blocked).</p>
    <blockquote style="border-left:3px solid #ccc;padding-left:10px;margin:10px 0">my number is 07… (example)</blockquote><p><a href="${base}/admin/student-chat">Open Student chat</a> to review it.</p>`, [to.email], "email-test"));

  // 17: office: new job application
  log("New job application (office)", await sendBatch(T("New application: English Teacher"),
    `Jamie Example has applied for English Teacher.\n\nPGCE evidence and two referees were provided.\n\nRead the application in the admin:\n${base}/admin/jobs`, [to], false));

  return { sent, failed };
}
