import { TeacherMail, type MailParams } from "./TeacherMail";

export const dynamic = "force-dynamic";
// 27 Nov (Alfonso: "why are the teacher email feature not working like the admin's one?"): the teacher's emails with the
// school, as a mail reader like Admin → Email (see ./TeacherMail.tsx). Messages has the conversations in the app.
export default function TeacherEmail({ searchParams }: { searchParams: Promise<MailParams> }) {
  return <TeacherMail searchParams={searchParams} />;
}
