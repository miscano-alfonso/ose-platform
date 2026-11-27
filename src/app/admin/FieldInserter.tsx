"use client";
import { useEffect, useRef, useState } from "react";
import { LINK_FIELDS } from "@/lib/email-layout";

// 27 Nov: "+ Insert" above an automation's message: adds a name, date, link etc. where the cursor is, without typing
// {{codes}}. Links go in as words ([Join Google Meet]({{meet_link}})) so the email shows "Join Google Meet", not the address.

const LABELS: Record<string, string> = {
  parent: "Parent’s first name", child: "Child’s first name", class: "Class name", date: "Lesson date", time: "Lesson time",
  teacher: "Teacher’s name", school: "School name", amount: "Amount", how: "How it’s paid (Direct Debit / card)", hours: "Head start (hours)",
  report: "Report name", old_when: "Original date and time", new_when: "New date and time", reason: "Reason (if one was given)", needed: "Families needed to start", count: "How many so far", list: "List of work to mark", term: "Term (e.g. Term 2)", courses: "Courses it’s for (list)", days: "Days overdue",
};

export function FieldInserter({ fields }: { fields: string[] }) {
  const me = useRef<HTMLDivElement>(null);
  const last = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false), [custom, setCustom] = useState(false);
  const [words, setWords] = useState(""), [url, setUrl] = useState("");

  const form = () => me.current?.closest("form") ?? null;
  const target = (): HTMLInputElement | HTMLTextAreaElement | null => last.current ?? (form()?.querySelector("textarea[name=body]") as HTMLTextAreaElement | null);
  useEffect(() => {
    const f = form(); if (!f) return;
    const remember = (e: Event) => { const t = e.target as HTMLElement; if (t.matches("textarea[name=body], input[name=subject]")) last.current = t as HTMLTextAreaElement; };
    const away = (e: MouseEvent) => { if (me.current && !me.current.contains(e.target as Node)) { setOpen(false); setCustom(false); } };
    f.addEventListener("focusin", remember); document.addEventListener("mousedown", away);
    return () => { f.removeEventListener("focusin", remember); document.removeEventListener("mousedown", away); };
  }, []);

  const put = (text: string, bodyOnly = false) => {
    let el = target();
    if (bodyOnly && el?.name !== "body") el = form()?.querySelector("textarea[name=body]") as HTMLTextAreaElement | null;
    if (!el) return;
    const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a;
    el.setRangeText(text, a, b, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));   // the preview listens for typing
    el.focus(); setOpen(false); setCustom(false);
  };
  const bold = () => {
    const el = target(); if (!el || el.name !== "body") return put("**bold text**", true);
    const a = el.selectionStart ?? 0, b = el.selectionEnd ?? a, sel = el.value.slice(a, b) || "bold text";
    el.setRangeText(`**${sel}**`, a, b, "end"); el.dispatchEvent(new Event("input", { bubbles: true })); el.focus();
  };

  const plain = fields.filter((f) => !LINK_FIELDS[f]), links = fields.filter((f) => LINK_FIELDS[f]);
  return <div className="fins" ref={me}>
    <button type="button" className="abtn sm fins-add" aria-expanded={open} onClick={() => { setOpen(!open); setCustom(false); }}>+ Insert</button>
    <button type="button" className="abtn sm" onClick={bold} title="Make the chosen words bold"><b>B</b></button>
    <span className="muted fins-tip">Click in the subject or message, then add a name, date or link.</span>
    {open && <div className="fins-pop" role="menu">
      {!custom ? <>
        {plain.length > 0 && <><div className="fins-h">Details</div>{plain.map((f) => <button type="button" role="menuitem" key={f} onClick={() => put(`{{${f}}}`)}>{LABELS[f] ?? f}</button>)}</>}
        {links.length > 0 && <><div className="fins-h">Links (shown as words)</div>{links.map((f) => <button type="button" role="menuitem" key={f} onClick={() => put(`[${LINK_FIELDS[f]}]({{${f}}})`, true)}>
          <span className="fins-link">{LINK_FIELDS[f]}</span></button>)}</>}
        <div className="fins-h">Other</div>
        <button type="button" role="menuitem" onClick={() => setCustom(true)}>A link to any web page…</button>
      </> : <div className="fins-custom">
        <label className="fld">Words to show<input value={words} onChange={(e) => setWords(e.target.value)} placeholder="e.g. Read our term dates" className="mini" autoFocus /></label>
        <label className="fld">Web address<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ohsoed.co.uk/term-dates" className="mini" /></label>
        <div style={{ display: "flex", gap: 6 }}><button type="button" className="abtn pri sm" disabled={!words.trim() || !/^(https?:\/\/|mailto:)?[\w.-]+\.[a-z]{2,}\S*$/i.test(url.trim())}
          onClick={() => { put(`[${words.trim().replace(/[[\]]/g, "")}](${url.trim()})`, true); setWords(""); setUrl(""); }}>Add the link</button>
          <button type="button" className="abtn sm" onClick={() => setCustom(false)}>Back</button></div>
      </div>}
    </div>}
  </div>;
}
