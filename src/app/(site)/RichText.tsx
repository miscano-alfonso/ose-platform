/** Plain text from the admin: lines starting "- " become bullet points, "## " a sub-heading, other lines paragraphs. */
export function RichText({ text }: { text: string }) {
  const out: React.ReactNode[] = []; let list: string[] = [];
  const flush = () => { if (list.length) out.push(<ul key={out.length}>{list.map((l, i) => <li key={i}>{l}</li>)}</ul>); list = []; };
  for (const line of text.split("\n")) {
    if (line.startsWith("- ")) list.push(line.slice(2));
    else { flush(); if (line.startsWith("## ")) out.push(<h3 key={out.length}>{line.slice(3)}</h3>); else if (line.trim()) out.push(<p key={out.length}>{line}</p>); }
  }
  flush();
  return <>{out}</>;
}
