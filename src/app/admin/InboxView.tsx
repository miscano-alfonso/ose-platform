"use client";
import { useEffect, useRef, useState } from "react";
import { InboxPanel, type PanelMail } from "./InboxReply";
import { inboxMessageAction, markInboxReadAction } from "./actions";

/** 27 Nov (Alfonso: "the email feature is very slow ... the toggles are confusing"): the Inbox list and the open email
 *  in one client view. Picking an email shows it straight away (no page reload), marks it read here at once (Gmail is
 *  told in the background), and keeps each email's text once loaded; hovering an email starts loading it. The blue dot
 *  shows unread. */
export type InboxItem = { id: string; who: string; subject: string; snippet: string; when: string; at: string; read: boolean;
  kind: [string, string] | null; to: string | null; replied: boolean; mailbox: string | null; panel: PanelMail };
type Full = Awaited<ReturnType<typeof inboxMessageAction>>;
const cache = new Map<string, Promise<Full>>();
export const loadMail = (id: string) => { let p = cache.get(id); if (!p) { p = inboxMessageAction(id).catch(() => ({ error: "Couldn’t reach the server. Try again." }) as Full); cache.set(id, p); p.then((r) => { if ("error" in r) cache.delete(id); }); } return p; };

export function InboxView({ items, initial, picked, base, sig, from }: { items: InboxItem[]; initial: string | null; picked: boolean; base: string;
  sig: Parameters<typeof InboxPanel>[0]["sig"]; from: string }) {
  const [sel, setSel] = useState<string | null>(initial);
  const [open, setOpen] = useState(picked);   // on a phone: the email instead of the list
  const [read, setRead] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((m) => [m.id, m.read])));
  const seen = useRef(new Set<string>());
  useEffect(() => { setRead((r) => ({ ...Object.fromEntries(items.map((m) => [m.id, m.read])), ...Object.fromEntries(Object.entries(r).filter(([k]) => seen.current.has(k))) })); }, [items]);
  // the first email is ready before it's clicked, and the next few load quietly
  useEffect(() => { const ids = [initial, ...items.slice(0, 4).map((m) => m.id)].filter(Boolean) as string[]; ids.forEach((id) => loadMail(id)); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const setReadOne = (id: string, v: boolean) => { seen.current.add(id); setRead((r) => ({ ...r, [id]: v })); markInboxReadAction(id, v).catch(() => null);
    window.dispatchEvent(new CustomEvent("ose-inbox-read", { detail: { id, read: v } })); };
  const pick = (id: string) => {
    setSel(id); setOpen(true);
    window.history.replaceState(null, "", `${base}&m=${id}`);
    if (!read[id]) setReadOne(id, true);
    const i = items.findIndex((m) => m.id === id); items.slice(i + 1, i + 3).forEach((m) => loadMail(m.id));
  };
  const m = items.find((x) => x.id === sel) ?? items[0] ?? null;
  return <div className={`ibx${open ? " picked" : ""}`}>
    <nav className="ibx-list" aria-label="Emails">{items.map((x) => <div key={x.id} className={`ibx-row${read[x.id] ? "" : " unread"}`} aria-current={x.id === m?.id ? "true" : undefined}>
      <a className="ibx-hit" href={`${base}&m=${x.id}`} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); pick(x.id); }} onMouseEnter={() => loadMail(x.id)} onFocus={() => loadMail(x.id)}
        aria-label={`${read[x.id] ? "" : "Unread: "}${x.who}: ${x.subject || "(no subject)"}`} />
      <span className="ibx-top"><b>{x.who}</b><time dateTime={x.at}>{x.when}</time></span>
      <span className="ibx-subj">{x.subject || "(no subject)"}</span>
      <span className="ibx-snip">{x.snippet}</span>
      <span className="ibx-tags">{x.kind && <span className={`pill ${x.kind[0]}`}>{x.kind[1]}</span>}{x.to && <span className="pill info">To {x.to}</span>}{x.replied && <span className="pill good">Replied</span>}{x.mailbox && <span className="muted">to {x.mailbox}</span>}</span>
    </div>)}</nav>
    {m && <InboxPanel key={m.id} m={{ ...m.panel, read: !!read[m.id] }} sig={sig} from={from} onRead={(v) => setReadOne(m.id, v)} onBack={() => setOpen(false)} />}
  </div>;
}
