import { requireStudent } from "@/lib/family-auth";
import { feedUrl } from "@/lib/calendar-feed";
import { Head } from "../../fmt";
import { CalendarSync } from "../../../CalendarSync";
import { calendarNewLinkAction } from "../../../calendar-actions";

export const dynamic = "force-dynamic";

export default async function StudentCalendar({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireStudent()]);
  const u = await feedUrl({ kind: "student", id: f.id });
  return <>
    <Head title="OH-SO ED Calendar" sub="Your lessons in your own calendar, with the Join link" />
    {sp.ok && <p className="note msg">Here’s your new calendar address. The old one no longer works: add this one to your calendar again.</p>}
    <CalendarSync {...u} has={["your lessons (with the Join link)", "1:1s", "workshops", "holidays"]} newLink={calendarNewLinkAction} area="student" />
  </>;
}
