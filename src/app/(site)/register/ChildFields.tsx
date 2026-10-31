"use client";
import { useState } from "react";

const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to answer"];

/** The child sections of the registration form: one to start, "Add another child" for brothers and sisters. */
export function ChildFields() {
  const [n, setN] = useState(1);
  return <>
    <input type="hidden" name="count" value={n} />
    {Array.from({ length: n }, (_, i) => <fieldset key={i} className="rg-child">
      <legend><span className="ab-k">Child {i + 1}</span>{i > 0 && i === n - 1 && <button type="button" className="rg-x" onClick={() => setN(n - 1)}>Remove</button>}</legend>
      <div className="row2"><label>First name<input name={`c${i}_first`} required={i === 0} maxLength={60} autoComplete="off" /></label>
        <label>Last name<input name={`c${i}_last`} required={i === 0} maxLength={60} autoComplete="off" /></label></div>
      <label>Google email address <small className="rg-warn">Please use a <b>Gmail account</b>: it must match the one your child uses for <b>Google Classroom</b>.</small>
        <input name={`c${i}_email`} type="email" required={i === 0} maxLength={160} placeholder="name@gmail.com" autoComplete="off" /></label>
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
