"use client";
import { useEffect, useState } from "react";

const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to answer"];

/** The child sections of the registration form: one to start, "Add another child" for brothers and sisters. */
/** Each child's email must be their own: not the parent's and not a brother's or sister's (checked again on the server). */
function checkEmails(form: HTMLFormElement | null) {
  if (!form) return;
  const parent = (form.querySelector<HTMLInputElement>('input[name="email"]')?.value || form.dataset.parentEmail || "").trim().toLowerCase();
  const seen = new Set<string>();
  form.querySelectorAll<HTMLInputElement>('input[name$="_email"]').forEach((el) => {
    const v = el.value.trim().toLowerCase();
    el.setCustomValidity(!v ? "" : v === parent ? "Your child needs their own email address, not the parent’s." : seen.has(v) ? "Each child needs a different email address." : "");
    if (v) seen.add(v);
  });
}

export function ChildFields() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>("form.rg-form"); if (!form) return;
    const on = () => checkEmails(form);
    form.addEventListener("input", on); form.addEventListener("submit", on, true);
    return () => { form.removeEventListener("input", on); form.removeEventListener("submit", on, true); };
  }, []);
  return <>
    <input type="hidden" name="count" value={n} />
    {Array.from({ length: n }, (_, i) => <fieldset key={i} className="rg-child">
      <legend><span className="ab-k">Child {i + 1}</span>{i > 0 && i === n - 1 && <button type="button" className="rg-x" onClick={() => setN(n - 1)}>Remove</button>}</legend>
      <div className="row2"><label>First name<input name={`c${i}_first`} required={i === 0} maxLength={60} autoComplete="off" /></label>
        <label>Last name<input name={`c${i}_last`} required={i === 0} maxLength={60} autoComplete="off" /></label></div>
      <label>Google email address <small className="rg-warn">Your child’s <b>own</b> Gmail account (not the parent’s): it must match the one they use for <b>Google Classroom</b>.</small>
        <input name={`c${i}_email`} type="email" required={i === 0} maxLength={160} placeholder="name@gmail.com" autoComplete="off"
          onInput={(e) => checkEmails(e.currentTarget.form)} onBlur={(e) => checkEmails(e.currentTarget.form)} /></label>
      <div className="row2"><label>Date of birth<input name={`c${i}_dob`} type="date" /></label>
        <label>Classroom name <small className="note">the name they like to be called</small><input name={`c${i}_known`} maxLength={60} /></label></div>
      <fieldset className="wk-fs"><legend>Gender</legend><div className="ct-pills">
        {GENDERS.map((g) => <label key={g}><input type="radio" name={`c${i}_gender`} value={g} /><span>{g}</span></label>)}</div></fieldset>
      <fieldset className="wk-fs"><legend>Does your child have SEND?</legend><div className="ct-pills">
        <label><input type="radio" name={`c${i}_send`} value="yes" /><span>Yes</span></label><label><input type="radio" name={`c${i}_send`} value="no" /><span>No</span></label></div></fieldset>
      <label>Reports or evidence <small className="note">optional · PDF, Word or photos, under 3.5 MB each</small>
        <input name={`c${i}_files`} type="file" multiple accept=".pdf,.doc,.docx,image/jpeg,image/png,image/webp" /></label>
    </fieldset>)}
    {n < 8 && <button type="button" className="rg-add" onClick={() => setN(n + 1)}>+ Add another child</button>}
  </>;
}
