"use client";
import { useTransition } from "react";

// The basket's "Starts" choice for one course: changing it saves straight away and the prices update in place (24–25 Nov)
export function StartPicker({ code, value, options, action }: { code: string; value: string; options: { key: string; label: string }[]; action: (f: FormData) => Promise<void> }) {
  const [busy, start] = useTransition();
  return <form action={action} className="bk-start" aria-busy={busy || undefined}><input type="hidden" name="code" value={code} />
    <label><span>Starts</span><select name="start" defaultValue={value} disabled={busy}
      onChange={(e) => { const f = new FormData(e.currentTarget.form!); start(() => action(f)); }}>
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select>{busy && <span className="bk-busy">Updating…</span>}</label>
    <noscript><button type="submit">Update</button></noscript></form>;
}
