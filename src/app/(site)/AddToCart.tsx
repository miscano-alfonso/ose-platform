"use client";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { addToCart } from "./cart/actions";

/** "Add to cart" on course cards and course pages: adds the class to the basket without leaving the page,
 *  then a pop-up confirms it (View basket / Keep browsing) and the button becomes "In basket". */
export function AddToCart({ code, label, className = "btn sm btn-line" }: { code: string; label: string; className?: string }) {
  const [inCart, setIn] = useState(false), [pending, start] = useTransition(), [toast, setToast] = useState<number | null>(null);
  const router = useRouter();
  useEffect(() => { setIn(decodeURIComponent(document.cookie.match(/(?:^|; )ose_cart=([^;]*)/)?.[1] ?? "").split(".").includes(code)); }, [code]);
  useEffect(() => { if (toast === null) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);
  const pop = toast !== null && typeof document !== "undefined" && createPortal(
    <div className="cart-toast" role="status" aria-live="polite">
      <span className="ct-tick" aria-hidden="true">✓</span>
      <div className="ct-txt"><b>Added to your basket</b><span>{label}{toast > 1 ? ` · ${toast} courses in your basket` : ""}</span></div>
      <div className="ct-acts"><button type="button" className="ct-go" onClick={() => router.push("/cart")}>View basket</button>
        <button type="button" className="ct-close" onClick={() => setToast(null)}>Keep browsing</button></div>
    </div>, document.body);
  if (inCart) return <><button type="button" className={`${className} in-cart`} onClick={() => router.push("/cart")}>In basket ✓</button>{pop}</>;
  return <><button type="button" className={className} disabled={pending} aria-busy={pending}
    onClick={() => start(async () => { const n = await addToCart(code); setIn(true); setToast(n); router.refresh(); })}>{pending ? "Adding…" : "Add to cart"}</button>{pop}</>;
}
