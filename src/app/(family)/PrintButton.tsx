"use client";
/** 27 Nov: prints the page (or saves it as a PDF from the print window). */
export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return <button type="button" className="abtn sm" onClick={() => window.print()}>{label}</button>;
}
