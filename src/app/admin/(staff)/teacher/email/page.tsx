import { TeacherInbox, type InboxParams } from "../messages/TeacherInbox";

export const dynamic = "force-dynamic";
// 27 Nov (Alfonso: "separate the emails and messages on teacher and parent dashboards, like the admin one"): the teacher's
// emails with the school (Messages has the conversations in the app). See ../messages/TeacherInbox.tsx.
export default function TeacherEmail({ searchParams }: { searchParams: Promise<InboxParams> }) {
  return <TeacherInbox mode="email" searchParams={searchParams} />;
}
