"use client";
import { useState } from "react";
import { addTeacherAction } from "./actions";
import { InviteForm } from "./forms";

/** 27 Nov: Staff & teachers → Add someone: a teacher (profile + sign-in by emailed link) or an admin (invitation to set a password). */
export function AddPerson({ teachers }: { teachers: { id: string; name: string; email: string; has_account: boolean }[] }) {
  const [kind, setKind] = useState<"teacher" | "admin">("teacher");
  return <div style={{ display: "grid", gap: 12 }}>
    <div className="segl" role="group" aria-label="Who are you adding?">
      <button type="button" aria-current={kind === "teacher" ? "true" : undefined} onClick={() => setKind("teacher")}>A teacher</button>
      <button type="button" aria-current={kind === "admin" ? "true" : undefined} onClick={() => setKind("admin")}>An admin (office)</button></div>
    {kind === "teacher" ? <>
      <form action={addTeacherAction} className="eform">
        <label className="fld">Full name<input name="name" required maxLength={80} /></label>
        <label className="fld">Email<input name="email" type="email" required maxLength={120} /></label>
        <button className="abtn pri" type="submit">Add teacher</button></form>
      <p className="cs" style={{ margin: 0 }}>Then fill in their website profile and photo. They sign in with a link: press <b>Email sign-in link</b> beside their name (or <b>Copy sign-in link</b> to send it yourself).</p></>
    : <>
      <InviteForm teachers={teachers} adminOnly />
      <p className="cs" style={{ margin: 0 }}>Admins see and change everything and sign in with a password; the invitation link lets them set it. If they also teach, choose their teacher profile and it joins their admin account (they get the Admin | Teacher switch).</p></>}
  </div>;
}
