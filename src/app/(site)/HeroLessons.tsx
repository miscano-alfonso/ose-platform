// Three live lessons (English, science, maths): a slide on screen with the teacher in a small video window.
// They take turns at the front of the stack. Student initials are made up; no children's faces.
type Lesson = { cls: string; colour: string; subject: string; teacher: string; photo: string; n: number; kicker: string; title: string; body: React.ReactNode; studs: [string, string][] };

const grid = Array.from({ length: 9 }, (_, i) => i * 15);
const LESSONS: Lesson[] = [
  { cls: "en", colour: "#2b5aa8", subject: "English", teacher: "Mrs Iacurci", photo: "/teachers/leanne-iacurci.webp", n: 6, kicker: "GCSE English Literature", title: "Macbeth: ambition",
    body: <><p className="hl-quote">“I have no spur to prick the sides of my intent, but only vaulting ambition…”</p><ul><li>What does the horse image suggest?</li><li>Find two more examples in Act 1</li></ul></>,
    studs: [["EM", "#3c6fd8"], ["JT", "#c0559e"], ["AK", "#2f9d77"]] },
  { cls: "sc", colour: "#c2577a", subject: "Science", teacher: "Mrs Rowe", photo: "/teachers/rachel-rowe.webp", n: 7, kicker: "GCSE Chemistry", title: "Rates of reaction",
    body: <><svg viewBox="0 0 220 120" className="hl-graph" aria-hidden="true"><path d="M20 105H210M20 105V8" stroke="#3d4366" strokeWidth="2" /><path d="M20 105C60 30 100 18 205 14" stroke="#1f8a63" strokeWidth="4" fill="none" /><path d="M20 105C70 62 120 44 205 36" stroke="#e3a33b" strokeWidth="4" fill="none" strokeDasharray="6 6" /><text x="150" y="58" fontSize="13" fill="#e3a33b">20°C</text><text x="150" y="9" fontSize="13" fill="#1f8a63">40°C</text></svg><ul><li>Higher temperature, faster reaction</li></ul></>,
    studs: [["LW", "#e8834b"], ["OB", "#3c6fd8"], ["FN", "#2f9d77"]] },
  { cls: "ma", colour: "#4f9b6c", subject: "Maths", teacher: "Miss Randle", photo: "/teachers/becky-randle.webp", n: 5, kicker: "GCSE Maths", title: "Straight-line graphs",
    body: <div className="hl-row"><svg viewBox="0 0 120 120" className="hl-plot" aria-hidden="true"><g stroke="#d9dcea" strokeWidth="1">{grid.map((x) => <path key={x} d={`M${x} 0V120M0 ${x}H120`} />)}</g><path d="M60 0V120M0 60H120" stroke="#3d4366" strokeWidth="2" /><path d="M15 112L105 8" stroke="#2c4fb8" strokeWidth="4" /></svg><span className="hl-eq">y = 2x + 1</span></div>,
    studs: [["SR", "#c0559e"], ["DP", "#e8834b"], ["HM", "#3c6fd8"]] },
];

// Where each screen floats around the boy's laptop, as % of the illustration box (laptop is at about 63% across, 48% down).
const AROUND: { left: number; top: number; width: number; delay: number }[] = [
  { left: 47, top: 15, width: 27, delay: 0 },    // English: above the laptop
  { left: 70, top: 33, width: 22, delay: -2.5 }, // Science: to the right
  { left: 55, top: 63, width: 26, delay: -5 },   // Maths: below, in front of the desk
];

function Win({ l, style, className }: { l: Lesson; style?: React.CSSProperties; className: string }) {
  return (
    <div className={`hl-win hl-${l.cls} ${className}`} style={{ ["--c" as string]: l.colour, ...style }} aria-hidden="true">
      <div className="hl-bar"><i /><i /><i /><span className="hl-t">{l.subject} · {l.teacher}</span><span className="hl-live">LIVE</span><span className="hl-n">{l.n} students</span></div>
      <div className="hl-slide">
        <div className="hl-k">{l.kicker}</div>
        <div className="hl-h">{l.title}</div>
        {l.body}
        <div className="hl-studs">{l.studs.map(([t, c]) => <span key={t} style={{ background: c }}>{t}</span>)}</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="hl-pip"><img src={l.photo} alt="" loading="lazy" /><span className="hl-nm"><span className="hl-wave"><b /><b /><b /></span>{l.teacher}</span></div>
      </div>
    </div>
  );
}

export function HeroLessons({ mode }: { mode: "around" | "alone" }) {
  if (mode === "around") return (
    <div className="hl-around" role="img" aria-label="Live online lessons in English, science and maths floating around the student's laptop">
      <svg className="hl-beams" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {AROUND.map((a, i) => <line key={i} x1="63" y1="47" x2={a.left + a.width / 2} y2={a.top + (i === 2 ? 4 : 14)} />)}
      </svg>
      {LESSONS.map((l, i) => { const a = AROUND[i]; return <Win key={l.cls} l={l} className="hl-float"
        style={{ left: `${a.left}%`, top: `${a.top}%`, fontSize: `${a.width / 40}cqw`, animationDelay: `${a.delay}s` }} />; })}
    </div>
  );
  return (
    <div className="hero-lessons hl-alone" role="img" aria-label="Three live online lessons: English, science and maths, each with the teacher on screen">
      <div className="hl-stage">{LESSONS.map((l, i) => <Win key={l.cls} l={l} className="hl-turn" style={{ animationDelay: `${-i * 5}s` }} />)}</div>
    </div>
  );
}
