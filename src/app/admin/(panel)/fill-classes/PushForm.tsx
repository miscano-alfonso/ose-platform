"use client";
import { useMemo, useState } from "react";
import type { Candidate } from "@/lib/class-push";

// 28 Nov: Fill a class: tick the families, check the email (it previews live for the first ticked family), then send.
type Vars = { cls: string; times: string; teacher: string; school: string };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const render = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="#" onclick="return false">$1</a>').replace(/\n/g, "<br>");

export function PushForm({ group, list, ticked, vars, subject0, body0, action, fields }: { group: string; list: Candidate[]; ticked: string[]; vars: Vars; subject0: string; body0: string;
  action: (f: FormData) => Promise<void>; fields: string[] }) {
  const [on, setOn] = useState<Set<string>>(new Set(ticked));
  const [subject, setSubject] = useState(subject0), [body, setBody] = useState(body0);
  const first = list.find((c) => on.has(c.key)) ?? list[0];
  const fill = (t: string) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => ({ parent: first?.parent_first ?? "Laura", child: first?.child_first ?? "Sam", class: vars.cls, times: vars.times, teacher: vars.teacher,
    taster_link: "#", school: vars.school } as Record<string, string>)[k] ?? m);
  const flip = (k: string) => setOn((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const all = (v: boolean) => setOn(new Set(v ? list.map((c) => c.key) : []));
  const groups = useMemo(() => [["student", "Current students at this level who don’t take it"], ["waiting", "On the waiting list"]] as const, []);
  return <form action={action} className="fc-form">
    <input type="hidden" name="group" value={group} />
    <div className="fc-pick">
      <div className="fc-bar"><b>{on.size} of {list.length} ticked</b><button type="button" className="abtn sm" onClick={() => all(true)}>Tick all</button><button type="button" className="abtn sm" onClick={() => all(false)}>Untick all</button></div>
      {groups.map(([kind, label]) => { const l = list.filter((c) => c.kind === kind); return l.length ? <div key={kind}><h3>{label} <span className="muted">{l.length}</span></h3>
        <ul>{l.map((c) => <li key={c.key} className={on.has(c.key) ? "on" : ""}><label>
          <input type="checkbox" name="pick" value={c.key} checked={on.has(c.key)} onChange={() => flip(c.key)} />
          <span className="fc-who"><b>{c.child}</b><span className="muted">{c.parent} · {c.email}</span>
            <span className="fc-tags">{c.takes && <i className="pill mute">Takes {c.takes}</i>}
              {c.clash && <i className="pill bad" title="A lesson at the same time">Clash: {c.clash}</i>}
              {c.had_taster && <i className="pill warn">Has had a taster of it</i>}
              {c.invited_at && <i className="pill info">Invited {new Date(c.invited_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</i>}
              {c.opted_out ? <i className="pill bad" title="This parent has said no to marketing emails">Said no to marketing</i> : !c.opted && <i className="pill mute" title="This parent hasn’t been asked about marketing emails yet">No marketing choice yet</i>}</span></span></label></li>)}</ul></div> : null; })}
      {!list.length && <p className="empty">No families to suggest: every current student at this level already takes it, and nobody is on its waiting list.</p>}
    </div>
    <div className="fc-mail">
      <label className="fld">Subject<input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required /></label>
      <label className="fld">Message<textarea name="body" rows={11} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} required /></label>
      <p className="muted fc-fields">Fill-ins: {fields.map((f) => <code key={f}>{`{{${f}}}`}</code>)} · **bold** · [words](link)</p>
      <div className="fc-prev"><p className="muted">Preview{first ? ` for ${first.parent}` : ""}</p><p><b>{fill(subject)}</b></p><div dangerouslySetInnerHTML={{ __html: render(fill(body)) }} /></div>
      <div className="fc-acts">
        <button className="abtn" type="submit" name="test" value="1" formNoValidate>Send me a test</button>
        <label className="chk"><input type="checkbox" name="confirm" /> I’ve checked the list and the email</label>
        <button className="abtn pri" type="submit" disabled={!on.size}>Send to {on.size} famil{on.size === 1 ? "y" : "ies"}</button>
      </div>
    </div>
  </form>;
}
