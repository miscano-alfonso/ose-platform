import type { Metadata } from "next";
import "../admin/admin.css";
import { safeNext } from "@/lib/front-door";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Password needed", robots: { index: false, follow: false } };

// 26 Nov: the page everyone sees first while FRONT_PASSWORD is set (see middleware.ts).
export default async function FrontDoor({ searchParams }: { searchParams: Promise<{ next?: string; e?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  return <main className="adm-auth"><div className="auth-wrap">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="auth-logo" src="/ose-logo-duo.svg" alt="OH-SO ED Online School" width={773} height={224} />
    <div className="box">
      <h1>Password needed</h1>
      <p>This is OH-SO ED&rsquo;s new site while it&rsquo;s being finished. Enter the password you were given.</p>
      <form method="post" action="/front-door/enter" style={{ display: "grid", gap: 14 }}>
        {sp.e && <p className="err" role="alert">That password isn&rsquo;t right. Please try again.</p>}
        <input type="hidden" name="next" value={next} />
        <label>Password<input type="password" name="password" autoComplete="current-password" required autoFocus /></label>
        <button type="submit">Continue</button>
      </form>
    </div>
  </div></main>;
}
