import Link from "next/link";
import { rewardsOverview } from "@/lib/community";
import { setPrizesAction, confirmWinnersAction, markWinnerAction } from "../../actions";

const day = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default async function Rewards({ searchParams }: { searchParams: Promise<{ term?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { terms, term, board, recent, prizes, winners } = await rewardsOverview(sp.term ?? null);
  const prize = (n: number) => prizes.find((p) => p.place === n)?.description ?? "";
  return <>
    <div className="top"><div><h1>Rewards</h1><div className="sub">Teachers give points (1–10) to students in their classes. The top 3 in the school each term win a gift.</div></div>
      <span className="grow" /><Link className="abtn pri" href="/admin/points">Give points</Link></div>
    {sp.ok && <p className="note msg">{sp.ok}</p>}{sp.err && <p className="note msg bad">{sp.err}</p>}
    <nav className="tabs" style={{ marginBottom: 14 }}>{terms.map((t) => <Link key={t.id} href={`/admin/rewards?term=${t.id}`} className={`abtn sm${t.id === term?.id ? " pri" : ""}`}>{t.name}</Link>)}</nav>
    {term && <section className="card"><h2>{term.name} leaderboard</h2>
      {board.length === 0 ? <p className="empty">No points given this term yet.</p> : <div className="tw" style={{ margin: 0 }}><table><thead><tr><th>Rank</th><th>Student</th><th>Points</th></tr></thead>
        <tbody>{board.map((b) => <tr key={b.student_id}><td>{b.rank <= 3 ? <span className="pill good">{b.rank}</span> : b.rank}</td><td>{b.name}</td><td><b>{b.points}</b></td></tr>)}</tbody></table></div>}
      {term.ended && term.winners === 0 && <form action={confirmWinnersAction} style={{ marginTop: 10 }}><input type="hidden" name="term" value={term.id} /><button className="abtn pri" type="submit">Confirm the winners</button></form>}
      {!term.ended && <p className="cs" style={{ marginTop: 8 }}>Winners can be confirmed after the term ends on {day(term.ends_on)}.</p>}
      {winners.length > 0 && <><h2 style={{ marginTop: 14 }}>Winners</h2>{winners.map((w) => <div className="li" key={w.id}>
        <span className="pill good">{w.place}</span><div className="t"><b>{w.name}</b><span>{w.points} points · {w.prize}</span></div>
        <div className="acts">{w.parent_emailed_at ? <span className="pill info">Family told</span> : <WBtn id={w.id} f="parent_emailed_at" l="Family told" />}
          {w.gift_sent_at ? <span className="pill good">Gift sent</span> : <WBtn id={w.id} f="gift_sent_at" l="Gift sent" />}</div></div>)}</>}
    </section>}
    <section className="card"><h2>Prizes</h2>
      <form action={setPrizesAction} className="eform">{[1, 2, 3].map((n) => <label key={n} className="fld">{n === 1 ? "1st" : n === 2 ? "2nd" : "3rd"} place<input name={`p${n}`} maxLength={120} defaultValue={prize(n)} placeholder="e.g. £20 Amazon voucher" style={{ width: 240 }} /></label>)}
        <button className="abtn" type="submit">Save prizes</button></form></section>
    <h2 style={{ font: "600 20px Jost", margin: "22px 0 10px" }}>Recent points</h2>
    {recent.length === 0 ? <p className="empty">None yet.</p> : <div className="tw"><table><thead><tr><th>Date</th><th>Student</th><th>Points</th><th>Why</th><th>Class</th><th>Teacher</th></tr></thead>
      <tbody>{recent.map((r) => <tr key={r.id}><td>{day(r.awarded_on)}</td><td>{r.student}</td><td><b>+{r.points}</b></td><td>{r.reason}</td><td>{r.class}</td><td>{r.teacher}</td></tr>)}</tbody></table></div>}
  </>;
}
function WBtn({ id, f, l }: { id: string; f: string; l: string }) {
  return <form action={markWinnerAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="field" value={f} /><button className="abtn sm" type="submit">{l}</button></form>;
}
