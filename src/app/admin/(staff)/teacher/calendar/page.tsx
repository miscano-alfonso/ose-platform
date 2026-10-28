import { requireViewer } from "@/lib/auth";
import { feedUrl } from "@/lib/calendar-feed";
import { CalendarSync } from "../../../../CalendarSync";
import { calendarNewLinkAction } from "../../../../calendar-actions";

export const dynamic = "force-dynamic";

export default async function TeacherCalendar({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, requireViewer()]);
  const u = await feedUrl({ kind: "staff", id: me.id });
  return <>
    <div className="top"><div><h1>OH-SO ED Calendar</h1><div className="sub">Your lessons in your own calendar app</div></div></div>
    {sp.ok && <p className="note msg">Here’s your new calendar address. The old one no longer works: add this one to your calendar again.</p>}
    <CalendarSync {...u} has={["the lessons you teach (with the lesson link and register)", "your 1:1s", "your workshops", "holidays"]} newLink={calendarNewLinkAction} area="teacher" />
  </>;
}
