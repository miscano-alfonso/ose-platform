import Link from "next/link";
import { GuideSlides } from "../../../admin/GuideSlides";
import { FAMILY_GUIDES } from "../../../admin/guides";
import { requireParent } from "@/lib/family-auth";
import { kids, parentMonth, REASONS, type MonthLesson } from "@/lib/family";
import { reportAbsenceAction, cancelAbsenceAction } from "../../actions";
import { Head, Flash } from "../../fmt";

export const dynamic = "force-dynamic";

// 27 Nov (Alfonso chose option B): the parent's Timetable: one module, a month calendar for one child. Lessons already
// taught show their mark (present, late, absent, approved absence); lessons to come have a tick box, and ticking them
// brings up the bar (reason, note, Report absence) along the bottom. A reported absence shows on its lesson, with Cancel.
// On a phone the calendar becomes a list of the days that have lessons.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const londonToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const short = (c: string) => c.replace(/^(KS3|Pre-GCSE|iGCSE|GCSE|A[- ]?Level)\s+/i, "");
const STATE: Record<string, [string, string, string]> = { present: ["tt-ok", "✓", "Present"], late: ["tt-late", "L", "Late"], absent: ["tt-abs", "✗", "Absent"], approved_absence: ["tt-appr", "E", "Approved absence"] };

export default async function ParentTimetable({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; kid?: string; m?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireParent()]);
  const ks = await kids(f.id);
  const kid = ks.find((k) => k.id === sp.kid) ?? ks[0];
  const today = londonToday();
  const ym = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : today.slice(0, 7);
  const [y, mo] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1)), last = new Date(Date.UTC(y, mo, 0));
  const start = new Date(first); start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const end = new Date(last); end.setUTCDate(last.getUTCDate() + (6 - ((last.getUTCDay() + 6) % 7)));
  const lessons = kid ? await parentMonth(f.id, kid.id, iso(start), iso(end)) : [];
  const byDay = new Map<string, MonthLesson[]>(); for (const l of lessons) byDay.set(l.date, [...(byDay.get(l.date) ?? []), l]);
  const days: Date[] = []; for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) days.push(new Date(d));
  const monthHref = (d: number) => { const t = new Date(Date.UTC(y, mo - 1 + d, 1)); return `/parent/attendance?${kid ? `kid=${kid.id}&` : ""}m=${iso(t).slice(0, 7)}`; };
  const monthName = (d: number) => MONTHS[new Date(Date.UTC(y, mo - 1 + d, 1)).getUTCMonth()];
  const taught = lessons.filter((l) => l.mark), count = (m: string) => taught.filter((l) => l.mark === m).length;
  const cancels: string[] = [];
  const chip = (l: MonthLesson) => {
    const label = <><b>{l.time}</b><span className="tt-c">{short(l.class)}{l.taster ? " (taster)" : ""}</span></>;
    if (l.status === "cancelled") return <div key={l.id} className="tt-l tt-cx" title="This lesson was cancelled">{label}<i>Cancelled</i></div>;
    if (l.mark) { const [c, sym, word] = STATE[l.mark] ?? ["tt-appr", "?", l.mark]; return <div key={l.id} className={`tt-l ${c}`} title={`${l.class}: ${word}${l.early ? ", left early" : ""}`}>{label}<i aria-label={word}>{sym}{l.early ? "↘" : ""}</i></div>; }
    if (l.past) return <div key={l.id} className="tt-l tt-none" title={`${l.class}: not marked yet`}>{label}<i>–</i></div>;
    if (l.notice) { cancels.push(l.notice); return <div key={l.id} className="tt-l tt-rep">{label}<span>Absence reported · <button type="submit" form={`cx-${l.notice}`} className="tt-link">Cancel</button></span></div>; }
    return <label key={l.id} className="tt-l tt-fut" title={`${l.time} ${l.class}: tick if ${kid?.first ?? "they"} will miss it`}><input type="checkbox" name="lesson" value={l.id} />{label}</label>;
  };
  return <>
    <Head title="Timetable" sub={kid ? `${kid.first}’s lessons: how each one went, and the ones coming up. Tick a lesson to tell us ${kid.first} will miss it.` : "Your children’s lessons"}>
      <GuideSlides slides={[...FAMILY_GUIDES["p-attendance"].slides]} title={FAMILY_GUIDES["p-attendance"].title} /></Head>
    <Flash sp={sp} />
    {!kid ? <p className="empty">Once your children are booked on a course, their lessons show here.</p> : <section className="card tt">
      <div className="tt-top">
        {ks.length > 1 && <div className="segl" role="group" aria-label="Child">{ks.map((k) => <Link key={k.id} href={`/parent/attendance?kid=${k.id}&m=${ym}`} aria-current={k.id === kid.id ? "true" : undefined}>{k.first}</Link>)}</div>}
        <div className="segl" role="group" aria-label="Month"><Link href={monthHref(-1)}>‹ {monthName(-1).slice(0, 3)}</Link><Link href={monthHref(0)} aria-current="true">{monthName(0)} {y}</Link><Link href={monthHref(1)}>{monthName(1).slice(0, 3)} ›</Link></div>
        <span className="grow" />
        {kid.att != null && <span className={`pill ${kid.att < 85 ? "warn" : "good"}`}>Attendance this term {kid.att}%</span>}
      </div>
      {taught.length > 0 && <p className="tt-sum">{monthName(0)}: <b>{count("present")}</b> present · <b>{count("late")}</b> late · <b>{count("absent")}</b> absent · <b>{count("approved_absence")}</b> approved absence{count("approved_absence") === 1 ? "" : "s"}</p>}
      <form action={reportAbsenceAction} className="tt-form"><input type="hidden" name="student" value={kid.id} /><input type="hidden" name="kid" value={kid.id} /><input type="hidden" name="m" value={ym} />
        <div className="tt-grid">
          {WD.map((w) => <div key={w} className="tt-wh">{w}</div>)}
          {days.map((d) => { const k = iso(d), ls = byDay.get(k) ?? [], other = d.getUTCMonth() !== mo - 1;
            return <div key={k} className={`tt-day${other ? " other" : ""}${k === today ? " today" : ""}${ls.length ? " has" : ""}${k > today ? " future" : ""}`}>
              <div className="tt-dn"><span className="tt-wd">{WD[(d.getUTCDay() + 6) % 7]} </span>{d.getUTCDate()}<span className="tt-wd"> {MONTHS[d.getUTCMonth()].slice(0, 3)}</span>{k === today ? " · Today" : ""}</div>
              {ls.map(chip)}</div>; })}
        </div>
        {lessons.length === 0 && <p className="empty">No lessons for {kid.first} this month.</p>}
        <div className="tt-bar">
          <span className="tt-hint">Tick the lessons {kid.first} will miss, and tell us here.</span>
          <span className="tt-n">Lessons ticked:&nbsp;<b className="tt-count" /></span>
          <select name="reason" aria-label="Reason">{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          <input name="note" maxLength={500} placeholder="Anything the teacher should know? (optional)" aria-label="Note for the teacher" />
          <button className="abtn pri" type="submit">Report absence</button>
        </div>
      </form>
      {cancels.map((id) => <form key={id} id={`cx-${id}`} action={cancelAbsenceAction} hidden><input type="hidden" name="id" value={id} /><input type="hidden" name="kid" value={kid.id} /><input type="hidden" name="m" value={ym} /></form>)}
      <p className="tt-key"><span className="tt-l tt-ok"><i>✓</i> Present</span><span className="tt-l tt-late"><i>L</i> Late</span><span className="tt-l tt-abs"><i>✗</i> Absent</span><span className="tt-l tt-appr"><i>E</i> Approved absence</span>
        <span className="muted">Attendance comes from each lesson’s Google Meet. Telling us before the lesson makes it an approved absence, which doesn’t count against attendance.</span></p>
    </section>}
  </>;
}
