"use client";
import { useRef } from "react";

// 27 Nov: "Where do you live?" on Resources → Information; choosing a place saves it and shows only the links for there.
export function LocationPicker({ action, back, place, countries, regions, readOnly }: { action: (f: FormData) => Promise<void>; back: string; place: string | null; countries: string[]; regions: string[]; readOnly?: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  return <form ref={form} action={action} className="rs-loc">
    <input type="hidden" name="back" value={back} />
    <label>Where do you live?
      <select name="place" defaultValue={place ?? ""} disabled={readOnly} onChange={() => form.current?.requestSubmit()}>
        <option value="">Show everywhere</option>
        <optgroup label="England">{["England", ...regions].map((r) => <option key={r} value={r}>{r === "England" ? "England (anywhere)" : r}</option>)}</optgroup>
        {countries.filter((c) => c !== "England").map((c) => <option key={c} value={c}>{c}</option>)}
      </select></label>
    <noscript><button className="abtn sm" type="submit">Show</button></noscript>
  </form>;
}
