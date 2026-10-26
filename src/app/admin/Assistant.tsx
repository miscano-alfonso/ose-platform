"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Proposal = { id: string; kind: string; params: Record<string, unknown>; summary: string; state?: "applied" | "dismissed" };
type Msg = { role: "user" | "assistant" | "tool"; text: string };
const SUGGEST = ["Summarise what needs my attention this week", "Who is below 50% attendance this term?", "Which payments have failed and how much is owed?",
  "Draft an email to waiting-list families for KS3 Science", "Plan a free KS3 History workshop for half term", "Which classes are nearly full?"];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const md = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^[-•*] (.*)$/gm, '<span class="ag-li">$1</span>').replace(/\n/g, "<br>");

/** The floating ✦ Assistant (as in the prototype): looks things up and prepares changes; the admin approves every change. */
export function Assistant() {
  const [open, setOpen] = useState(false), [msgs, setMsgs] = useState<Msg[]>([]), [props, setProps] = useState<Proposal[]>([]), [busy, setBusy] = useState(false), [text, setText] = useState("");
  const body = useRef<HTMLDivElement>(null), router = useRouter(), ctl = useRef<AbortController | null>(null);
  useEffect(() => { try { const s = JSON.parse(sessionStorage.getItem("ose-assistant") || "null"); if (s) { setMsgs(s.msgs || []); setProps(s.props || []); } } catch { /* fresh */ } }, []);
  useEffect(() => { try { sessionStorage.setItem("ose-assistant", JSON.stringify({ msgs: msgs.slice(-40), props: props.slice(-20) })); } catch { /* private mode */ } body.current?.scrollTo(0, 1e6); }, [msgs, props, open]);

  async function ask(q: string) {
    if (busy || !q.trim()) return;
    const hist: Msg[] = [...msgs, { role: "user", text: q }];
    setMsgs([...hist, { role: "assistant", text: "" }]); setBusy(true); setText("");
    ctl.current = new AbortController();
    try {
      const r = await fetch("/admin/assistant-api", { method: "POST", headers: { "content-type": "application/json" }, signal: ctl.current.signal,
        body: JSON.stringify({ messages: hist.filter((m) => m.role !== "tool").map((m) => ({ role: m.role, text: m.text })) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong. Try again.");
      setMsgs([...hist, ...(j.steps as string[]).map((s) => ({ role: "tool" as const, text: s + "…" })), { role: "assistant", text: j.text }]);
      setProps((p) => [...p, ...(j.proposals as Proposal[])]);
    } catch (e) {
      setMsgs([...hist, { role: "assistant", text: (e as Error).name === "AbortError" ? "(Stopped.)" : (e as Error).message }]);
    }
    setBusy(false);
  }
  async function applyP(p: Proposal) {
    try {
      const r = await fetch("/admin/assistant-api?action=apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: p.kind, params: p.params }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn’t apply it.");
      setProps((all) => all.map((x) => x.id === p.id ? { ...x, state: "applied" } : x));
      setMsgs((m) => [...m, { role: "tool", text: j.message }]);
      if (j.href) router.push(j.href); else router.refresh();
    } catch (e) { setMsgs((m) => [...m, { role: "tool", text: (e as Error).message }]); }
  }
  const pending = props.filter((p) => !p.state);
  return <>
    <button className="ag-btn" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>✦ Assistant</button>
    {open && <aside className="ag" aria-label="Assistant">
      <div className="ag-h"><div><b>✦ Assistant</b><span>Looks things up and prepares changes. You approve every change.</span></div>
        <span style={{ display: "flex", gap: 6 }}>{msgs.length > 0 && !busy && <button className="abtn sm" type="button" onClick={() => { setMsgs([]); setProps([]); }}>New chat</button>}
          <button className="abtn sm" type="button" onClick={() => setOpen(false)} aria-label="Close">✕</button></span></div>
      <div className="ag-body" ref={body}>
        {msgs.length === 0 && <div className="ag-hello"><p>Ask about families, attendance, payments, classes, tasters, 1:1s, workshops or reports, or ask me to draft something.</p>
          <div className="ag-sugg">{SUGGEST.map((q) => <button type="button" key={q} onClick={() => ask(q)}>{q}</button>)}</div></div>}
        {msgs.map((m, i) => m.role === "user" ? <div className="ag-m u" key={i}>{m.text}</div> : m.role === "tool" ? <div className="ag-t" key={i}>{m.text}</div>
          : <div className="ag-m a" key={i} dangerouslySetInnerHTML={{ __html: m.text ? md(m.text) : '<span class="muted">Thinking… (looking things up can take up to a minute)</span>' }} />)}
        {pending.map((p) => <div className="ag-p" key={p.id}><span className="pill info">Proposed change</span><b>{p.summary}</b>
          {p.kind === "email" && <div className="ag-pre">{String(p.params.body ?? "").slice(0, 700)}</div>}
          <div style={{ display: "flex", gap: 6 }}><button className="abtn sm pri" type="button" onClick={() => applyP(p)}>{p.kind === "email" ? "Open to review and send" : "Apply"}</button>
            <button className="abtn sm" type="button" onClick={() => setProps((all) => all.map((x) => x.id === p.id ? { ...x, state: "dismissed" } : x))}>Dismiss</button></div></div>)}
      </div>
      <form className="ag-in" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <textarea rows={2} value={text} placeholder="Ask the assistant…" disabled={busy} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(text); } }} />
        {busy ? <button type="button" className="abtn sm" onClick={() => ctl.current?.abort()}>Stop</button> : <button className="abtn sm pri" type="submit">Send</button>}
      </form>
    </aside>}
  </>;
}
