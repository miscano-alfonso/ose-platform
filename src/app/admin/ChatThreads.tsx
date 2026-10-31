import Link from "next/link";
import type { ReactNode } from "react";
import { threadTitle, type ChatMsg, type ChatThread } from "@/lib/chat-threads";

const when = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/** A class chat as threads (31 Oct), for students, teachers and the office alike.
 *  With no thread open: a box to start a new thread (topic + message) and the threads, most recent first.
 *  With a thread open (?t=…): its first message and replies, and a reply box. */
export function ChatThreads({ threads, open, msgs, href, action, hidden, canPost = true, off, control, who = "class" }: {
  threads: ChatThread[]; open: ChatThread | null; msgs: ChatMsg[];
  href: (t?: string) => string; action: (f: FormData) => Promise<void>; hidden: Record<string, string>;
  canPost?: boolean; off?: ReactNode; control?: (m: ChatMsg) => ReactNode; who?: string;
}) {
  const fields = Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  if (open) return <div className="ct">
    <p className="backlink"><Link className="abtn sm" scroll={false} href={href()}>← All threads</Link></p>
    <h3 className="ct-title">{threadTitle(open)}</h3>
    <p className="ct-meta">Started by {open.who} · {when(open.at)} · {open.replies} repl{open.replies === 1 ? "y" : "ies"}</p>
    <div className="ct-msgs">{msgs.map((m, i) => <div key={m.id} className={`ct-msg${i === 0 ? " first" : ""}${m.mine ? " mine" : ""}${m.teacher ? " teacher" : ""}${m.hidden ? " gone" : ""}`}>
      <div className="ct-who"><b>{m.mine ? "You" : m.who}</b>{m.teacher && <span className="pill">Teacher</span>}<span className="muted">{when(m.at)}</span><span className="grow" />{control?.(m)}</div>
      <div className="ct-body">{m.hidden && !m.body ? <i className="muted">Message removed by staff</i> : m.body}{m.hidden && m.body ? <span className="muted"> · hidden from students</span> : null}</div>
    </div>)}</div>
    {canPost ? <form action={action} className="ct-form">{fields}<input type="hidden" name="thread" value={open.id} />
      <textarea name="body" rows={2} maxLength={1000} required placeholder="Reply in this thread…" aria-label="Reply" />
      <button className="abtn pri" type="submit">Reply</button></form> : off}
  </div>;
  return <div className="ct">
    {canPost ? <form action={action} className="ct-new">{fields}
      <p className="ct-k">Start a new thread</p>
      <input name="topic" required maxLength={120} placeholder="What’s it about? e.g. Homework question 3" aria-label="Topic" />
      <div className="ct-form"><textarea name="body" rows={2} maxLength={1000} required placeholder={`Write to the ${who}…`} aria-label="Message" />
        <button className="abtn pri" type="submit">Start thread</button></div>
    </form> : off}
    {threads.length === 0 ? <p className="empty">No threads yet. Start one about something specific, like a homework question.</p>
    : <ul className="ct-list">{threads.map((t) => <li key={t.id}><Link scroll={false} href={href(t.id)} className="ct-row">
        <span className="ct-t"><b>{threadTitle(t)}</b><span className="muted">{t.who}{t.topic && !t.hidden && t.body ? `: ${t.body.length > 90 ? t.body.slice(0, 88).trimEnd() + "…" : t.body}` : ""}</span></span>
        <span className="ct-n"><span className={`pill${t.replies ? "" : " mute"}`}>{t.replies} repl{t.replies === 1 ? "y" : "ies"}</span>
          <span className="muted">{t.replies && t.last_who ? `${t.last_who} · ` : ""}{when(t.last_at)}</span></span>
      </Link></li>)}</ul>}
  </div>;
}
