// Suggested GCSE grades from Classroom marks (1 Nov). Edexcel International GCSE (9–1).
// Boundaries differ by subject and exam series, so these are a general guide (roughly where Edexcel iGCSE boundaries
// fall as a percentage of the total mark), not exact: the teacher always checks and can change the grade.
export const IGCSE_BOUNDS: [grade: number, minPct: number][] = [[9, 80], [8, 72], [7, 64], [6, 55], [5, 47], [4, 39], [3, 29], [2, 19], [1, 10]];
export const gradeFor = (pct: number) => IGCSE_BOUNDS.find(([, m]) => pct >= m)?.[0] ?? 1;

export type Mark = { pct: number; at: string; term: boolean; assess: boolean };
/** Working grade: this term's marks (the end-of-term assessment counts double). Predicted: the working grade moved by the
 *  trend across the year (later work against earlier work): +1 for 8+ points better, +2 for 16+, −1 for 8+ points worse. */
export function suggestGrades(marks: Mark[]): { working: number | null; predicted: number | null; basis: string } {
  const term = marks.filter((m) => m.term);
  if (!term.length) return { working: null, predicted: null, basis: "" };
  const w = term.reduce((a, m) => a + (m.assess ? 2 : 1), 0);
  const avg = term.reduce((a, m) => a + m.pct * (m.assess ? 2 : 1), 0) / w;
  const working = gradeFor(avg);
  const all = [...marks].sort((a, b) => a.at.localeCompare(b.at));
  let shift = 0, trend = "";
  if (all.length >= 4) {
    const half = Math.floor(all.length / 2), mean = (xs: Mark[]) => xs.reduce((a, m) => a + m.pct, 0) / xs.length;
    const d = mean(all.slice(half)) - mean(all.slice(0, half));
    shift = d >= 16 ? 2 : d >= 8 ? 1 : d <= -8 ? -1 : 0;
    trend = shift > 0 ? ", improving" : shift < 0 ? ", dipping" : ", steady";
  }
  const predicted = Math.min(9, Math.max(1, working + shift));
  return { working, predicted, basis: `${Math.round(avg)}% this term over ${term.length} marked piece${term.length === 1 ? "" : "s"}${trend}` };
}
