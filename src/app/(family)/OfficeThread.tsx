// A conversation the office started, as a parent or student sees it (5 Nov), with a reply box.
const when = (s: string) => new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
type T = { th: { id: string; subject: string; status: string; about: string | null }; msgs: { id: string; sender: string; who: string; body: string; at: string }[] };
export function OfficeThreadView({ t, kind, action }: { t: T; kind: "parent" | "student"; action: (f: FormData) => Promise<void> }) {
  return <>
    <h2>{t.th.subject}</h2><p className="cs">From the office{t.th.about ? ` · about ${t.th.about}` : ""}{t.th.status === "closed" ? " · closed" : ""}</p>
    <div style={{ display: "grid", gap: 8, margin: "8px 0 12px" }}>{t.msgs.map((m) => <div key={m.id} className="card" style={{ margin: 0, padding: "8px 12px", background: m.sender !== "office" ? "var(--soft)" : undefined }}>
      <div className="muted" style={{ fontSize: 14 }}><b>{m.who}</b> · {when(m.at)}</div><div style={{ whiteSpace: "pre-line" }}>{m.body}</div></div>)}</div>
    {t.th.status === "open" ? <form action={action} style={{ display: "grid", gap: 8 }}><input type="hidden" name="id" value={t.th.id} /><input type="hidden" name="kind" value={kind} />
      <textarea name="body" rows={4} required maxLength={5000} className="mini" style={{ width: "100%" }} aria-label="Reply" /><div><button className="abtn pri" type="submit">Reply to the office</button></div></form>
      : <p className="note">This conversation is closed.</p>}
  </>;
}
