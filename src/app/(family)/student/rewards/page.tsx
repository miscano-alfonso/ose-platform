import { requireStudent } from "@/lib/family-auth";
import { studentRewards } from "@/lib/family";
import { Head, dm } from "../../fmt";

export default async function Rewards() {
  const f = await requireStudent();
  const r = await studentRewards(f.id);
  return <>
    <Head title="Rewards" sub={`Teachers give points for great work. The top 3 in the school${r.term ? ` at the end of ${r.term.name}` : " each term"} win a prize.`} />
    <div className="dgrid">
      <section className="card" style={{ margin: 0 }}><h2>Leaderboard</h2>{r.board.length === 0 ? <p className="empty">No points yet this term.</p> : r.board.map((b) => <div className="li" key={b.rank + b.name} style={b.me ? { background: "var(--soft)", borderRadius: 10, paddingInline: 8 } : undefined}>
        <span className="mono" style={{ width: 36 }}>{b.rank <= 3 ? ["🥇", "🥈", "🥉"][b.rank - 1] : b.rank}</span><div className="t"><b>{b.me ? "You" : b.name}</b></div><b>{b.points}</b></div>)}
        {r.prizes.length > 0 && <p className="note" style={{ marginTop: 10 }}>Prizes: {r.prizes.map((p) => `${["1st", "2nd", "3rd"][p.place - 1]} ${p.description}`).join(" · ")}</p>}</section>
      <section className="card" style={{ margin: 0 }}><h2>Your points</h2>{r.mine.length === 0 ? <p className="empty">No points yet. Keep going!</p> : r.mine.map((p, i) => <div className="li" key={i}>
        <span className="pill good">+{p.points}</span><div className="t"><b>{p.reason}</b><span>{p.class} · {p.teacher} · {dm(p.on)}</span></div></div>)}</section>
    </div>
  </>;
}
