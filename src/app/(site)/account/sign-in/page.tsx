import type { Metadata } from "next";
import { redeemLinkAction } from "../../../(family)/actions";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

// The link in the sign-in email opens this page; the button uses the link. (Email scanners that open links
// automatically don't press buttons, so they can't use up the link before the parent does.)
export default async function SignIn({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return <section className="s-sec"><div className="wrap">
    <form className="login" action={redeemLinkAction}><input type="hidden" name="t" value={t ?? ""} />
      <h1 style={{ marginTop: 0 }}>Sign in</h1><p>Press the button to sign in to your account on this device.</p>
      <button className="btn btn-brand" type="submit">Sign in</button></form>
  </div></section>;
}
