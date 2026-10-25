import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin login", robots: { index: false, follow: false } };

// Staff sign-in for the admin. The admin area itself comes in a later update;
// until then the form is shown but can't be used.
export default function AdminLogin() {
  return (<>
    <section className="s-phead"><div className="wrap"><h1>Admin login</h1><p>For OH-SO ED staff.</p></div></section>
    <section className="s-sec"><div className="wrap">
      <form className="login" aria-describedby="login-note">
        <label>Email<input type="email" name="email" autoComplete="username" disabled /></label>
        <label>Password<input type="password" name="password" autoComplete="current-password" disabled /></label>
        <button className="btn btn-brand" type="button" disabled>Sign in</button>
        <p id="login-note" className="note">The admin area is being built. Sign-in will open here once it’s ready.</p>
      </form>
    </div></section>
  </>);
}
