"use client";
import { useState } from "react";

/** OH-SO ED Calendar: the private calendar address and one-click ways to add it to Google, Apple or Outlook. */
export function CalendarSync({ https, webcal, google, has, newLink, area }: { https: string; webcal: string; google: string; has: string[]; newLink: (f: FormData) => Promise<void>; area: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(https); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* the box can be selected by hand */ } };
  const box: React.CSSProperties = { display: "grid", gap: 12, padding: "18px 20px", border: "1px solid var(--line)", borderRadius: 18, background: "var(--panel, transparent)", maxWidth: 760, marginBottom: 16 };
  const step: React.CSSProperties = { display: "grid", gap: 6 };
  return <>
    <section style={box}>
      <h2 style={{ margin: 0, fontSize: 20 }}>Add to your calendar</h2>
      <p style={{ margin: 0 }}>Shows {has.join(", ").replace(/, ([^,]*)$/, " and $1")} in your own calendar app. It keeps itself up to date: a cancelled lesson shows as cancelled, a moved one moves. Apple Calendar and Outlook check for changes every hour or so; Google Calendar can take up to a day.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a className="abtn pri" href={google} target="_blank" rel="noopener">Google Calendar</a>
        <a className="abtn" href={webcal}>Apple Calendar or Outlook</a>
        <button type="button" className="abtn" onClick={copy}>{copied ? "Copied ✓" : "Copy the calendar address"}</button>
      </div>
      <input readOnly value={https} onFocus={(e) => e.currentTarget.select()} aria-label="Your calendar address" className="mini" style={{ width: "100%", fontSize: 13.5 }} />
    </section>
    <section style={box}>
      <h2 style={{ margin: 0, fontSize: 18 }}>If the buttons don’t work</h2>
      <div style={step}><b>Google Calendar (computer)</b><span>Other calendars → + → From URL → paste the address → Add calendar. It then shows on your phone too.</span></div>
      <div style={step}><b>iPhone or iPad</b><span>Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar → paste the address.</span></div>
      <div style={step}><b>Mac</b><span>Calendar → File → New Calendar Subscription → paste the address.</span></div>
      <div style={step}><b>Outlook</b><span>Add calendar → Subscribe from web → paste the address.</span></div>
    </section>
    <section style={box}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Keep it private</h2>
      <p style={{ margin: 0 }}>Anyone with this address can see the times in it, so don’t share it. If it has been shared, make a new one: the old address stops working and you add the new one to your calendar again.</p>
      <form action={newLink} onSubmit={(e) => { if (!confirm("Make a new calendar address? The old one stops working.")) e.preventDefault(); }}>
        <input type="hidden" name="area" value={area} /><button className="abtn sm" type="submit">Make a new address</button></form>
    </section>
  </>;
}
