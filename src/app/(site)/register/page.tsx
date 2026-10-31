import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { currentFamily } from "@/lib/family-auth";
import { cartCodes } from "@/lib/cart";
import { registerAction } from "./actions";
import { ChildFields } from "./ChildFields";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Register", robots: { index: false, follow: false } };
const TERMS_URL = "https://ohsoed.co.uk/terms-conditions";
const HEARD = ["Facebook", "Instagram", "Google", "A friend or family member", "Home-ed group", "Other"];

// Parent registration (31 Oct): needed before checking out. The parent's details, then each child; signed-in parents use it to add a child.
export default async function Register({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const [sp, fam, codes] = await Promise.all([searchParams, currentFamily(), cartCodes()]);
  const parent = fam?.kind === "parent" ? fam : null;
  const next = sp.next && /^\/(cart|parent)/.test(sp.next) ? sp.next : codes.length ? "/cart" : "/parent";
  return (<>
    <section className="s-phead"><div className="wrap"><h1>{parent ? "Add a child" : "Register"}</h1>
      <p>{parent ? `Signed in as ${parent.first} ${parent.last}. Add a child to your account, then choose them for each course in your basket.`
        : "Create your family account: your details, then your children. You’ll be signed in straight away and can check out."}</p>
      <div className="cd-hbtns">{codes.length > 0 && <Link href="/cart">← Back to basket</Link>}{!parent && <Link href="/account?next=cart">I already have an account</Link>}</div>
    </div></section>
    <section className="s-sec"><div className="wrap rg-wrap">
      <form action={registerAction} className="cform ct-form rg-form" encType="multipart/form-data">
        {sp.error && <p className="notice err" role="alert">{sp.error}</p>}
        <input type="hidden" name="next" value={next} />
        {!parent && <fieldset className="rg-child"><legend><span className="ab-k">Parent or guardian</span></legend>
          <div className="row2"><label>First name<input name="first" autoComplete="given-name" required maxLength={60} /></label>
            <label>Last name<input name="last" autoComplete="family-name" required maxLength={60} /></label></div>
          <div className="row2"><label>Email<input name="email" type="email" autoComplete="email" required maxLength={200} /></label>
            <label>Phone <small className="note">optional</small><input name="phone" type="tel" autoComplete="tel" maxLength={30} /></label></div>
          <label>How did you hear about us? <small className="note">optional</small><select name="heard" defaultValue=""><option value="">Choose one</option>{HEARD.map((h) => <option key={h}>{h}</option>)}</select></label>
        </fieldset>}
        <ChildFields />
        {!parent && <>
          <label className="bk-check"><input type="checkbox" name="marketing" /><span>Email me about new courses, workshops and spaces (a few times a term)</span></label>
          <label className="bk-check"><input type="checkbox" name="terms" required /><span>I agree to the <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a></span></label></>}
        <label className="hp" aria-hidden="true">Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <button className="wk-go bk-go" type="submit">{parent ? "Add child" : "Create my account"}</button>
        {!parent && <p className="note">You sign in with a link we email you, so there’s no password to remember.</p>}
      </form>
    </div></section>
  </>);
}
