import { requireParent } from "@/lib/family-auth";
import { feedUrl } from "@/lib/calendar-feed";
import { Head } from "../../fmt";
import { CalendarSync } from "../../../CalendarSync";
import { calendarNewLinkAction } from "../../../calendar-actions";

export const dynamic = "force-dynamic";

export default async function ParentCalendar({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireParent()]);
  const u = await feedUrl({ kind: "parent", id: f.id });
  return <>
    <Head title="OH-SO ED Calendar" sub="Your children’s lessons and payment dates in your own calendar app" />
    {sp.ok && <p className="note msg">Here’s your new calendar address. The old one no longer works: add this one to your calendar again.</p>}
    <CalendarSync {...u} has={["each child’s lessons", "1:1s", "workshops", "holidays", "term dates", "when each term’s payment is due"]} newLink={calendarNewLinkAction} area="parent" />
  </>;
}
