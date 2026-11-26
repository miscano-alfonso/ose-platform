import Link from "next/link";

/** 27 Nov: Automations has two tabs: the settings and wording, and Review & approve. */
export function AutoTabs({ here, toApprove }: { here: "edit" | "review"; toApprove: number }) {
  return <div className="segl" role="tablist" aria-label="Automations" style={{ marginBottom: 16 }}>
    <Link href="/admin/automations" aria-current={here === "edit" ? "true" : undefined}>Switch on &amp; edit wording</Link>
    <Link href="/admin/automations/review" aria-current={here === "review" ? "true" : undefined}>Review &amp; approve{toApprove ? ` (${toApprove} to approve)` : " ✓"}</Link>
  </div>;
}
