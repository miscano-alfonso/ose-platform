"use client";
import { useFormStatus } from "react-dom";

/** 26 Nov: a submit button that says what's happening while a slow action runs (e.g. Match, which re-reads Google
 *  Classroom for every class and takes up to a minute), so it doesn't look as if nothing happened. */
export function BusyButton({ children, busy, className = "abtn sm pri" }: { children: React.ReactNode; busy: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? busy : children}</button>;
}
