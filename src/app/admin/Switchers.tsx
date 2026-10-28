"use client";
import { setSchoolAction, setViewAsAction } from "./actions";

type Opt = { value: string; label: string; disabled?: boolean };
/** The School and "Viewing as" pickers at the top of the admin sidebar (as in the prototype). */
export function Switchers({ schools, school, views, view, showSchool = true }: { schools: Opt[]; school: string; views: Opt[]; view: string; showSchool?: boolean }) {
  return <div className="switchers">
    {showSchool && <form action={setSchoolAction} className="sw"><label htmlFor="swSchool">School</label>
      <select id="swSchool" name="school" defaultValue={school} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {schools.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></form>}
    <form action={setViewAsAction} className="sw"><label htmlFor="swView">Viewing as</label>
      <select id="swView" name="as" defaultValue={view} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {views.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}</select></form>
  </div>;
}
