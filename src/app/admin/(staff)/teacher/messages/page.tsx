import { TeacherInbox, type InboxParams } from "./TeacherInbox";

export const dynamic = "force-dynamic";
// Messages (31 Oct; 26 Nov as one inbox; 27 Nov: messages in the app only, emails are on Email): see TeacherInbox.tsx.
export default function TeacherMessages({ searchParams }: { searchParams: Promise<InboxParams> }) {
  return <TeacherInbox mode="messages" searchParams={searchParams} />;
}
