import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { messageOptions } from "@/lib/office-messages";
import { isTestMode } from "@/lib/test-mode";
import { sendOfficeMessageAction } from "../../../actions";
import { WriteForm } from "./WriteForm";

export const metadata = { title: "New message" };

// Admin → Messages → New message (5 Nov): to a parent, student or teacher, or to every parent or student in a class or level.
export default async function NewMessage({ searchParams }: { searchParams: Promise<{ aud?: string; target?: string; err?: string }> }) {
  await requireStaff();
  const [sp, opts, test] = await Promise.all([searchParams, messageOptions(), isTestMode().catch(() => false)]);
  return <>
    <p className="backlink"><Link className="abtn sm" href="/admin/messages">← Messages</Link></p>
    <div className="top"><div><h1>New message</h1><div className="sub">It shows in their area of the platform, where they can reply, and a copy goes by email. A message to a group reaches each person privately.</div></div></div>
    {sp.err && <p className="note msg bad">{sp.err}</p>}
    <WriteForm opts={opts} action={sendOfficeMessageAction} initial={{ aud: sp.aud, target: sp.target }} testMode={test} />
  </>;
}
