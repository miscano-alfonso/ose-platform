import { requireStaff } from "@/lib/auth";
import { getLayout, mirrorOf } from "@/lib/dashboard-layout";
import { schoolPlan } from "@/lib/plan";
import { BentoBoard } from "../BentoBoard";
import { adminModules } from "../dash/admin-board";
import { SoloBoard } from "../dash/solo-board";

export default async function Dashboard() {
  const me = await requireStaff();
  const { plan } = await schoolPlan();
  if (plan === "solo") return <SoloBoard me={me} />;   // Solo: one person is admin and teacher, so one dashboard
  const modules = await adminModules(me, plan);
  const known = modules.map((x) => x.id);
  const [saved, mirror] = await Promise.all([getLayout(me.id, "admin-home", known), mirrorOf()]);
  return <BentoBoard page="admin-home" modules={modules} layout={saved ?? DEFAULT_LAYOUT} defaults={DEFAULT_LAYOUT} saved={!!saved} locked={!!mirror} />;
}

const DEFAULT_LAYOUT: { id: string; size: "s" | "m" | "l" | "xl" | "full" }[] = [
  { id: "hero", size: "full" },
  { id: "k-students", size: "s" }, { id: "k-places", size: "s" }, { id: "k-attendance", size: "s" }, { id: "k-collected", size: "s" }, { id: "k-next", size: "s" }, { id: "k-failed", size: "s" },
  { id: "today", size: "l" }, { id: "attention", size: "l" },
  { id: "collections", size: "m" }, { id: "bookings", size: "m" }, { id: "tasters", size: "m" },
  { id: "email", size: "l" },
  { id: "coming", size: "l" }, { id: "fullest", size: "l" },
];
