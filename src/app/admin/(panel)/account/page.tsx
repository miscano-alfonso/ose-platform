import { requireStaff } from "@/lib/auth";
import { PasswordForm } from "../../forms";

export default async function AccountSettings() {
  const me = await requireStaff();
  return <>
    <div className="top"><div><h1>Settings</h1><div className="sub">Your admin account</div></div></div>
    <section className="card"><h2>{me.name}</h2><p className="cs">{me.email} · School admin</p>
      <p className="note">Sessions last 12 hours. After 5 wrong passwords in 15 minutes, sign-in for that email pauses for 15 minutes.</p></section>
    <section className="card"><h2>Change password</h2><PasswordForm /></section>
  </>;
}
