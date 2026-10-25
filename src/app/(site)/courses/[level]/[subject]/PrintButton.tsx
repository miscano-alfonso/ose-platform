"use client";
export function PrintButton() {
  return <button type="button" className="btn btn-line sm" onClick={() => window.print()}>Print</button>;
}
