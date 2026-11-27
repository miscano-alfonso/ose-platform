"use client";
import { useRef } from "react";

/** 27 Nov (Alfonso): "Swap or cancel a course" as a text link at the top right of Payments; it brings up the options
 *  for each course in a window, instead of a button in every row of the table. */
export function SwapCancel({ children }: { children: React.ReactNode }) {
  const dlg = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" className="linkish sc-open" onClick={() => dlg.current?.showModal()}>Swap or cancel a course</button>
    <dialog ref={dlg} className="gv-dlg sc-dlg" aria-label="Swap or cancel a course" onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
      <div className="gv-head"><b>Swap or cancel a course</b><button type="button" className="abtn sm" onClick={() => dlg.current?.close()} aria-label="Close">✕</button></div>
      <div className="sc-body">{children}</div>
    </dialog>
  </>;
}
