// The look of every email (header in the school's colour with its logo, which is white like the dashboard's)
// The look of every email the school sends (one-off emails and the automatic ones): a header with the school's logo,
// the message, and a footer. Edited under Admin → Email → Email design. Safe to import on the client (the live preview).

export type EmailDesign = { logo: boolean; color: string; footer: string; logoUrl: string; school: string };
export const defaultFooter = (school: string, site: string) =>
  [school, site ? site.replace(/^https?:\/\//, "") : "", "You can reply to this email to get in touch."].filter(Boolean).join("\n");

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const linkify = (s: string) => esc(s).replace(/\b((?:https?:\/\/|www\.)[^\s<]+|[a-z0-9-]+\.(?:co\.uk|com|org|net|uk)(?:\/[^\s<]*)?)/gi, (m) => `<a href="${/^https?:/.test(m) ? m : "https://" + m}" style="color:inherit">${m}</a>`)
  .replace(/\b([\w.+-]+@[\w-]+\.[\w.]+)\b/g, (m) => `<a href="mailto:${m}" style="color:inherit">${m}</a>`);

/** The HTML of an email: written for email programs (tables, inline styles, no web fonts). */
export function emailHtml(body: string, marketing: boolean, d: EmailDesign): string {
  const color = /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : "#0f1747";
  const paras = body.trim().split(/\n\s*\n/).filter(Boolean).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const foot = d.footer.trim().split("\n").map((l) => l.trim()).filter(Boolean).map(linkify).join("<br>");
  const unsub = marketing ? `<p style="margin:10px 0 0">You’re receiving this because you agreed to hear from ${esc(d.school)}. To stop these emails, reply with UNSUBSCRIBE.</p>` : "";
  const head = d.logo && d.logoUrl
    ? `<img src="${esc(d.logoUrl)}" alt="${esc(d.school)}" height="44" style="display:block;height:44px;width:auto;max-width:240px;border:0">`
    : `<span style="font:bold 18px Arial,Helvetica,sans-serif;letter-spacing:.06em;color:#ffffff">${esc(d.school.toUpperCase())}</span>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f8;padding:20px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#171b2b">
<tr><td style="padding:18px 24px;background:${color}">${head}</td></tr>
<tr><td style="padding:22px 24px 8px">${paras || "<p style=\"margin:0 0 14px;color:#8a90a6\">Your message will appear here.</p>"}</td></tr>
<tr><td style="padding:16px 24px 22px;background:#f7f8fb;border-top:1px solid #e2e4ee;font-size:12.5px;line-height:1.6;color:#5c6378">${foot}${unsub}</td></tr>
</table></td></tr></table>`;
}
