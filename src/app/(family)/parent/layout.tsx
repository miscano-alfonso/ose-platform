import type { Metadata } from "next";
import { requireParent } from "@/lib/family-auth";
import { withSchool } from "@/lib/db";
import { Shell } from "../Shell";
import { menuFor } from "@/lib/menu-config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const f = await requireParent();
  const [c] = await withSchool((q) => q<{ msgs: number; asks: number }>(`select
    (select count(distinct m.thread_id)::int from messages m join message_threads th on th.id = m.thread_id where th.parent_id = $1 and m.sender <> 'parent' and m.read_by_parent_at is null) as msgs,
    (select count(*)::int from contact_requests r where r.to_parent_id = $1 and r.status = 'pending' and r.expires_at > now()) as asks`, [f.id]));
  return <Shell f={f} root="/parent" groups={await menuFor("parent")} counts={{ "/parent/messages": c.msgs, "/parent/connect": c.asks }}>{children}</Shell>;
}
