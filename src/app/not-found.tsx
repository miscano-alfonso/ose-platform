import Link from "next/link";
export default function NotFound() {
  return <section className="s-sec"><div className="wrap"><h1>Page not found</h1><p><Link href="/">Back to the homepage</Link></p></div></section>;
}
