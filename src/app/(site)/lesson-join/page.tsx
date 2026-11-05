import type { Metadata } from "next";
import Link from "@/app/(site)/HoverLink";
import { currentFamily } from "@/lib/family-auth";
import { familySignOutAction } from "../../(family)/actions";

export const metadata: Metadata = { title: "Joining a lesson", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// 5 Nov: where /join/<class> sends someone it won't let into a lesson (see src/app/join/[group]/route.ts).
export default async function LessonJoin({ searchParams }: { searchParams: Promise<{ why?: string }> }) {
  const { why } = await searchParams;
  const f = await currentFamily().catch(() => null);
  const body = why === "parent" ? <>
      <h1 style={{ marginTop: 0 }}>Lessons are joined from your child’s own account</h1>
      <p>You’re signed in as a parent{f?.first ? ` (${f.first})` : ""}. To keep lessons safe, only the student can open the lesson, signed in to their own account and their own Google account.</p>
      <p>On your child’s device: sign out here, then sign in with <b>your child’s email address</b> (the Google account we have for them). The Join button on their dashboard then works for 30 days.</p>
      <form action={familySignOutAction}><button className="btn btn-brand" type="submit">Sign out</button></form></>
    : why === "notyours" ? <>
      <h1 style={{ marginTop: 0 }}>This isn’t one of your classes</h1>
      <p>You can only join lessons for the classes you’re booked on. If you think this is a mistake, please ask a parent to contact us.</p>
      <p><Link href="/student">Back to my dashboard</Link></p></>
    : <>
      <h1 style={{ marginTop: 0 }}>This class doesn’t have a lesson link yet</h1>
      <p>Please check your class in Google Classroom, or ask your teacher.</p>
      <p><Link href={f?.kind === "parent" ? "/parent" : "/student"}>Back to the dashboard</Link></p></>;
  return <section className="s-sec"><div className="wrap"><div className="login">{body}</div></div></section>;
}
