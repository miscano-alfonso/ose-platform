import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { withSchool } from "./db";
import { studentReport } from "./reports";
import { OSE_LOGO_PNG } from "./report-pdf-logo";

// 26 Nov: the report as a PDF, laid out like the school's own (landscape A4): the year and the logo, the student's name and
// the report's name, a table of subjects (level, Progress and Effort pills, working and predicted grades, the teacher's
// comment), then the Grading Key on its own page. Attached to "Email the reports to parents" and downloadable in the admin.
const W = 842, H = 595, L = 57, R = 785;
const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const PURPLE = hex("#5A4FCF"), GREY = hex("#8A8A8A"), INK = hex("#111111"), HEAD_BG = hex("#EEEEEE"), KEY_HEAD = hex("#CCCCCC");
const PILL: Record<number, string> = { 5: "#E2CCF2", 4: "#CFE8C0", 3: "#F7EE9C", 2: "#F7C98A", 1: "#F1B3A2", 0: "#ECECEC" };
const ROW: Record<number, [string, string]> = { 5: ["#F1E9F7", "#E5D2F3"], 4: ["#EFF6EA", "#D5EBC2"], 3: ["#FDF8DF", "#FBF29D"], 2: ["#FCEEDC", "#F7C77A"], 1: ["#FAE7E4", "#F2B6A8"] };
// the school's grading key (its 2024-26 reports), used when Settings has no wording of its own for a band
const KEY_TEXT: Record<number, [string, string]> = {
  5: ["Well above our expectations\nThe student consistently demonstrates evidence of a deeper understanding/higher skill level in the subject and can make connections between content areas.",
      "Shows an outstanding level of interest and commitment to the subject\nIs always very enthusiastic\nFrequently goes beyond the requirements of the task\nParticipates fully in live lessons\nCompletes home study tasks with maximum effort and maintains high standards"],
  4: ["Secure in our expectations.\nThe student demonstrates evidence of a secure understanding in all content and skills.\nThey are showing a more advanced understanding/skill level in some areas and can extend their learning to new contexts.",
      "Shows an active interest and commitment to the subject\nIs always enthusiastic\nAlways completes all tasks set and will sometimes go beyond the requirements of the task\nParticipates well in live lessons\nCompletes home study tasks on time and to a good standard"],
  3: ["Meeting our expectations.\nThe student demonstrates a secure understanding/skill level in most areas of the subject when applied to familiar contexts.",
      "Demonstrates the expected level of commitment to the subject\nIs normally enthusiastic\nOften participates in live lessons\nCompleted home study tasks to a good standard"],
  2: ["Approaching but sometimes below our expectations.\nThe student has grasped some of the main skills and ideas, but their understanding is not yet comprehensive.\nThey have gaps in their skills and knowledge related to a unit of work or an assessment.",
      "Needs to develop a more positive attitude to learning the subject\nIs sometimes enthusiastic\nWill occasionally participate in live lessons\nMay need prompts to complete work, or meet study task deadlines"],
  1: ["Current level is below expectations.\nThe student is beginning to learn/understand subject content/skills but there are specific gaps in their knowledge and/or skills related to a unit of work or an assessment.",
      "Shows very little engagement with the subject\nIs rarely enthusiastic\nLack of participation in live lessons\nOften needs prompts to complete work, or meet study task deadlines"],
};
/** Only characters the built-in PDF fonts can draw (curly quotes and dashes are fine; anything else becomes a plain stand-in). */
const clean = (s: string) => (s || "").normalize("NFKC").replace(/[‘’‚′]/g, "’").replace(/[“”„″]/g, "”").replace(/[–—]/g, "–")
  .replace(/…/g, "...").replace(/[   ]/g, " ").replace(/\t/g, " ").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^\x0A\x20-\x7E£©®°·é’”–€•]/g, "");
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split("\n")) {
    let line = "";
    for (const w of para.split(/ +/)) { const t = line ? line + " " + w : w; if (font.widthOfTextAtSize(t, size) <= width || !line) line = t; else { out.push(line); line = w; } }
    out.push(line);
  }
  return out;
}

export async function reportPdf(cycleId: string, studentId: string): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const r = await studentReport(cycleId, studentId);
  if (!r) return null;
  const lines = r.lines.filter((l) => l.status === "approved");
  if (!lines.length) return null;
  const meta = (await withSchool((q) => q<{ year: string | null; bands: { score: number; label: string; min_pct: number; progress_text: string | null; effort_text: string | null }[] }>(`
    select (select y.label from academic_years y where y.id = c.academic_year_id) as year,
      (select coalesce(json_agg(json_build_object('score', b.score, 'label', b.label, 'min_pct', b.min_pct::float, 'progress_text', b.progress_text, 'effort_text', b.effort_text) order by b.score desc), '[]') from grade_bands b) as bands
    from report_cycles c where c.id = $1`, [cycleId])))[0];
  const year = (meta?.year || "").replace(/^(\d{4})\s*[-/–]\s*(\d{2,4})$/, (_, a, b) => `${a}–${String(b).slice(-2)}`) || "";
  const bands = (meta?.bands ?? []).length ? meta!.bands : [5, 4, 3, 2, 1].map((s, i) => ({ score: s, label: ["Exceeding", "Secure", "Meeting", "Working Towards", "Improvement Needed"][i], min_pct: [95, 70, 50, 40, 0][i], progress_text: null, effort_text: null }));
  const doc = await PDFDocument.create();
  doc.setTitle(`${r.student} – ${r.cycle}`); doc.setAuthor(r.school);
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(Buffer.from(OSE_LOGO_PNG, "base64"));
  const top = (y: number) => H - y;   // measure from the top, like the design
  const right = (p: PDFPage, s: string, x: number, y: number, size: number, f: PDFFont, color: RGB) => p.drawText(s, { x: x - f.widthOfTextAtSize(s, size), y, size, font: f, color });
  function chrome(p: PDFPage, heading: { name: string; title?: string }) {
    p.drawText(clean(`${year ? year + " " : ""}Subject Reports`), { x: L, y: top(72), size: 11.5, font: bold, color: GREY });
    const lw = 92, lh = lw * 144 / 480; p.drawImage(logo, { x: R - lw, y: top(76), width: lw, height: lh });
    p.drawLine({ start: { x: L, y: top(81) }, end: { x: R, y: top(81) }, thickness: 0.8, color: PURPLE });
    p.drawText(clean(heading.name), { x: L, y: top(106), size: 21, font: bold, color: PURPLE });
    if (heading.title) right(p, clean(heading.title), R, top(106), 21, bold, GREY);
  }
  function foot(p: PDFPage, y: number) {
    p.drawText("OH–SO EDUCATE LTD", { x: L, y, size: 7, font: bold, color: PURPLE });
    right(p, "ohsoed.co.uk", R, y, 7, bold, PURPLE);
  }
  const pill = (p: PDFPage, cx: number, y: number, v: number | null, w = 36, grey = false) => {   // grey: grades, not scores
    const n = grey ? 0 : v ?? 0, h = 10, x = cx - w / 2, rr = h / 2, c = hex(PILL[Math.max(0, Math.min(5, n))]);
    p.drawRectangle({ x: x + rr, y: y - h, width: w - 2 * rr, height: h, color: c });
    p.drawCircle({ x: x + rr, y: y - rr, size: rr, color: c }); p.drawCircle({ x: x + w - rr, y: y - rr, size: rr, color: c });
    const s = v == null ? "–" : String(v); p.drawText(s, { x: cx - font.widthOfTextAtSize(s, 7) / 2, y: y - 7.3, size: 7, font, color: INK });
  };

  // ---------- page 1 (and more if it doesn't fit): the subjects ----------
  const cols = [{ k: "subject", w: 91 }, { k: "Level", w: 40 }, { k: "Progress", w: 53 }, { k: "Efforts", w: 51 }, { k: "Working\nGrade*", w: 56 }, { k: "Predicted\nGrade*", w: 60 }, { k: "Targets", w: 0 }];
  cols[6].w = (R + 2) - (L) - cols.slice(0, 6).reduce((a, c) => a + c.w, 0);
  const xs: number[] = []; cols.reduce((x, c) => { xs.push(x); return x + c.w; }, L);
  let page = doc.addPage([W, H]); chrome(page, { name: r.student, title: r.cycle });
  let y = top(138);
  const header = () => {
    const hh = 37; page.drawRectangle({ x: xs[1], y: y - hh, width: R + 2 - xs[1], height: hh, color: HEAD_BG, borderColor: PURPLE, borderWidth: 0.75 });
    cols.forEach((c, i) => { if (i === 0) return; if (i > 1) page.drawLine({ start: { x: xs[i], y }, end: { x: xs[i], y: y - hh }, thickness: 0.75, color: PURPLE });
      c.k.split("\n").forEach((t, j) => page.drawText(t, { x: xs[i] + 8, y: y - 14 - j * 10, size: 8.5, font, color: PURPLE })); });
    y -= hh;
  };
  header();
  const TSIZE = 8.6, TLH = 11;
  for (const l of lines) {
    const t = wrap(l.comment || "", font, TSIZE, cols[6].w - 18), subj = wrap(l.subject, font, 7, cols[0].w - 14), lev = wrap(l.level || "", font, 7, cols[1].w - 10);
    const rh = Math.max(52, t.length * TLH + 22, subj.length * 9 + 22);
    if (y - rh < 70) { foot(page, 40); page = doc.addPage([W, H]); chrome(page, { name: r.student, title: r.cycle }); y = top(138); header(); }
    page.drawRectangle({ x: L, y: y - rh, width: R + 2 - L, height: rh, borderColor: PURPLE, borderWidth: 0.75 });
    for (let i = 1; i < cols.length; i++) page.drawLine({ start: { x: xs[i], y }, end: { x: xs[i], y: y - rh }, thickness: 0.75, color: PURPLE });
    subj.forEach((s, j) => page.drawText(s, { x: L + 8, y: y - 17 - j * 9, size: 7, font, color: PURPLE }));
    lev.forEach((s, j) => page.drawText(s, { x: xs[1] + 8, y: y - 17 - j * 9, size: 7, font, color: PURPLE }));
    pill(page, xs[2] + cols[2].w / 2, y - 10, l.progress); pill(page, xs[3] + cols[3].w / 2, y - 10, l.effort);
    pill(page, xs[4] + cols[4].w / 2, y - 10, l.working_grade, 34, true); pill(page, xs[5] + cols[5].w / 2, y - 10, l.predicted_grade, 34, true);
    t.forEach((s, j) => page.drawText(s, { x: xs[6] + 9, y: y - 19 - j * TLH, size: TSIZE, font, color: INK }));
    y -= rh;
  }
  page.drawText("* Working and Predicted Grades are for GCSE Courses only", { x: L, y: y - 40, size: 6.5, font, color: INK });
  foot(page, y - 62);

  // ---------- the Grading Key ----------
  const kp = doc.addPage([W, H]); chrome(kp, { name: "Grading Key" });
  const c0 = L - 2, c1 = L + 55, c2 = L + 135, c3 = L + 445, c4 = R + 2, gap = 10;
  let ky = top(122);
  kp.drawRectangle({ x: c2, y: ky - 26, width: c3 - c2 - gap / 2, height: 26, color: KEY_HEAD }); kp.drawText("Progress", { x: c2 + 9, y: ky - 17, size: 8.5, font: bold, color: PURPLE });
  kp.drawRectangle({ x: c3 + gap / 2, y: ky - 26, width: c4 - c3 - gap / 2, height: 26, color: KEY_HEAD }); kp.drawText("Efforts", { x: c3 + gap / 2 + 9, y: ky - 17, size: 8.5, font: bold, color: PURPLE });
  ky -= 26;
  const sorted = [...bands].sort((a, b) => b.score - a.score);
  sorted.forEach((b, i) => {
    const hi = i === 0 ? 100 : Math.round(sorted[i - 1].min_pct) - 1, range = `${Math.round(b.min_pct)}-${hi}%`;
    const [pt, et] = [(b.progress_text || KEY_TEXT[b.score]?.[0] || "").trim(), (b.effort_text || KEY_TEXT[b.score]?.[1] || "").trim()];
    const bulletLines = (text: string, width: number) => text.split("\n").filter(Boolean).reduce((n, para) => n + wrap(para, font, 6.6, width).length, 0);
    const lab = wrap(b.label, font, 7, c2 - c1 - 18);
    const rh = Math.max(bulletLines(pt, c3 - c2 - 30), bulletLines(et, c4 - c3 - 30), lab.length + 1) * 8.6 + 14;
    const [light, dark] = ROW[b.score] ?? ["#F4F4F4", "#E4E4E4"];
    kp.drawRectangle({ x: c0, y: ky - rh, width: c1 - c0, height: rh, color: hex(light) });
    kp.drawRectangle({ x: c1, y: ky - rh, width: c2 - c1 - 8, height: rh, color: hex(dark) });
    kp.drawRectangle({ x: c2, y: ky - rh, width: c3 - c2 - gap / 2, height: rh, color: hex(light) });
    kp.drawRectangle({ x: c3 + gap / 2, y: ky - rh, width: c4 - c3 - gap / 2, height: rh, color: hex(light) });
    pill(kp, c0 + 26, ky - 8, b.score, 34);
    lab.concat(range).forEach((s, j) => kp.drawText(s, { x: c1 + 8, y: ky - 16 - j * 8.6, size: 7, font, color: INK }));
    // bullet points: one per line of the wording; wrapped lines are indented under it
    const bl = (text: string, x: number, width: number) => { let j = 0; for (const para of text.split("\n").filter(Boolean)) { const w = wrap(para, font, 6.6, width);
      kp.drawText("•", { x: x + 10, y: ky - 16 - j * 8.6, size: 6.6, font, color: INK }); w.forEach((s) => { kp.drawText(s, { x: x + 17, y: ky - 16 - j * 8.6, size: 6.6, font, color: INK }); j++; }); } };
    bl(pt, c2, c3 - c2 - 30); bl(et, c3 + gap / 2, c4 - c3 - 30);
    ky -= rh + 4;
  });
  foot(kp, ky - 8);
  const bytes = await doc.save();
  const slug = (s: string) => clean(s).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return { bytes, filename: `OSE-${slug((year || "").replace("–", "_")) || "Report"}-${slug(r.cycle)}-${slug(r.student)}.pdf`.replace(/--+/g, "-") };
}
