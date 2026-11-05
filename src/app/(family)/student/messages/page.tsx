import { requireStudent } from "@/lib/family-auth";
import { myOfficeThreads, myOfficeThread } from "@/lib/office-messages";
import { familyOfficeReplyAction } from "../../actions";
import { Head, Flash, dm } from "../../fmt";
import { OfficeThreadView } from "../../OfficeThread";

// A student's messages from the school office (5 Nov). Class chat stays on the Chat page.
export default async function StudentMessages({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; o?: string }> }) {
  const [sp, f] = await Promise.all([searchParams, requireStudent()]);
  const rows = await myOfficeThreads("student", f.id);
  const id = sp.o ?? rows[0]?.id;
  const sel = id ? await myOfficeThread("student", f.id, id, !f.viewer) : null;
  return <>
    <Head title="Messages" sub="Messages from the school office. Reply here and the office will see it." />
    <Flash sp={sp} />
    {rows.length === 0 ? <section className="card"><p className="empty">No messages yet.</p></section> :
      <div className="dgrid">
        <section className="card" style={{ margin: 0 }}>{rows.map((t) => <a key={t.id} href={`/student/messages?o=${t.id}`} className="li" style={{ textDecoration: "none", color: "inherit", ...(t.id === sel?.th.id ? { background: "var(--hover)", borderRadius: 10, paddingInline: 8 } : {}) }}>
          <div className="t"><b>{t.subject}</b><span>The office · {dm(t.last_at)}</span></div>{t.unread && <span className="pill info">New</span>}{t.status === "closed" && <span className="pill mute">Closed</span>}</a>)}</section>
        <section className="card" style={{ margin: 0 }}>{sel ? <OfficeThreadView t={sel} kind="student" action={familyOfficeReplyAction} /> : <p className="empty">Choose a message.</p>}</section>
      </div>}
  </>;
}
