import { getInvite } from "@/lib/auth";
import { AcceptForm } from "../../../forms";

export const dynamic = "force-dynamic";

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await getInvite(token);
  if (!inv || inv.used || inv.expired) return <><h1>Invitation not valid</h1><p className="err">This link has expired or has already been used. Ask the school for a new invitation.</p></>;
  return <>
    <h1>Welcome, {inv.name}</h1>
    <p>You’ve been invited to the OH-SO ED {inv.role === "school_admin" ? "admin" : "staff area as a teacher"}. You’ll sign in with <b>{inv.email}</b>.</p>
    <AcceptForm token={token} />
  </>;
}
