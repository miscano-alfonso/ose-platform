"use client";
// The basket's "Starts" choice for one course: changing it saves straight away (24 Nov)
export function StartPicker({ code, value, options, action }: { code: string; value: string; options: { key: string; label: string }[]; action: (f: FormData) => void }) {
  return <form action={action} className="bk-start"><input type="hidden" name="code" value={code} />
    <label><span>Starts</span><select name="start" defaultValue={value} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
    <noscript><button type="submit">Update</button></noscript></form>;
}
