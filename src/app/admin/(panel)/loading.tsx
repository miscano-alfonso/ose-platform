// 26 Nov: shown the moment a menu item is clicked, while the page is being put together (the menu stays where it is).
export default function Loading() {
  return <div className="ld" role="status" aria-live="polite"><span className="sr-only">Loading…</span>
    <div className="ld-h" /><div className="ld-s" />
    <div className="ld-grid"><div className="ld-c big" /><div className="ld-c" /><div className="ld-c" /><div className="ld-c" /><div className="ld-c" /></div>
  </div>;
}
