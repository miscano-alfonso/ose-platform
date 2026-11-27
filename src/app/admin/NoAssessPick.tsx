"use client";
import { useState } from "react";

// 27 Nov: "No assessment because": a choice of common reasons, or Other to type one. The chosen wording is saved as before.
export const NO_ASSESS_REASONS = ["Absent for the assessment", "Sent back to redo, not resubmitted", "Handed in, not marked yet",
  "Medical or personal reasons", "Joined the class after the assessment", "No assessment set for this class this term", "Taking a break from the course"];

export function NoAssessPick({ name, value, disabled }: { name: string; value: string; disabled?: boolean }) {
  const known = NO_ASSESS_REASONS.includes(value);
  const [pick, setPick] = useState(value ? (known ? value : "__other") : "");
  const [other, setOther] = useState(known ? "" : value);
  const final = pick === "__other" ? other : pick;
  return <span className="na-pick">
    <input type="hidden" name={name} value={final} />
    <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={disabled} className="mini" aria-label="No assessment because">
      <option value="">Choose a reason…</option>
      {NO_ASSESS_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      <option value="__other">Other (type it)</option>
    </select>
    {pick === "__other" && <input value={other} onChange={(e) => setOther(e.target.value)} maxLength={200} disabled={disabled} placeholder="Type the reason" className="mini" style={{ width: 220 }} autoFocus={!other} />}
  </span>;
}
