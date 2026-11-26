import { redeemStaffLinkAction } from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

// 26 Nov: the link in a teacher's sign-in email opens this page; the button uses the link (email scanners that open
// links automatically don't press buttons, so they can't use it up first).
export default async function StaffLink({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return <>
    <h1>Sign in</h1>
    <p>Press the button to sign in to your teacher dashboard on this device.</p>
    <form action={redeemStaffLinkAction} style={{ display: "grid", gap: 14 }}>
      <input type="hidden" name="t" value={t ?? ""} />
      <button type="submit">Sign in</button>
    </form>
  </>;
}
