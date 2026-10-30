import type { Staff } from "@/lib/auth";
import { soloLayout } from "@/lib/dashboard-layout";
import { BOARD_MODULES } from "@/lib/dash-modules";
import { BentoBoard, type BoardModule } from "../BentoBoard";
import { adminModules } from "./admin-board";
import { teacherModules } from "./teacher-board";

// The Solo plan's dashboard: one person runs the school and teaches, so the admin home and the teacher's "My day" are
// one board. Alfonso arranges it in OH-SO ED (Settings → Solo dashboard); every Solo school shows that arrangement.
const FROM_TEACHER = new Set(["hero", "week", "messages", "stream", "k-ones"]);
const FROM_ADMIN = new Set(["hero", "k-students", "k-places", "k-attendance", "k-collected", "k-next", "k-failed", "today", "attention", "collections", "tasters", "bookings", "coming", "fullest", "email"]);
export const SOLO_BUILT_IN: { id: string; size: "s" | "q" | "m" | "l" | "xl" | "full"; h?: "s" | "m" | "l" }[] = [
  { id: "hero", size: "xl" }, { id: "attention", size: "m", h: "m" },
  { id: "k-students", size: "s" }, { id: "k-places", size: "s" }, { id: "k-attendance", size: "s" }, { id: "k-collected", size: "s" }, { id: "k-next", size: "s" }, { id: "k-failed", size: "s" },
  { id: "week", size: "l", h: "m" }, { id: "messages", size: "l", h: "m" },
  { id: "email", size: "l" }, { id: "bookings", size: "l" },
  { id: "tasters", size: "m" }, { id: "k-ones", size: "m" }, { id: "collections", size: "m" },
  { id: "coming", size: "l" }, { id: "fullest", size: "l" },
];

/** The modules: the teacher's next lesson (with Join, Attendance and the clock) as the hero, the admin's greeting as "overview". */
export async function soloModules(me: Staff, teacher: { id: string; name: string }): Promise<BoardModule[]> {
  const [a, t] = await Promise.all([adminModules(me, "solo"), teacherModules(teacher)]);
  return [
    ...t.filter((x) => FROM_TEACHER.has(x.id)),
    ...a.filter((x) => FROM_ADMIN.has(x.id)).map((x) => x.id === "hero" ? { ...x, id: "overview", title: "Today and the term" } : x),
  ];
}

/** In a Solo school: the board as arranged in OH-SO ED (no customising there). */
export async function SoloBoard({ me }: { me: Staff }) {
  const known = BOARD_MODULES["solo-home"];
  const [modules, b] = await Promise.all([soloModules(me, me), soloLayout(known, SOLO_BUILT_IN)]);
  return <div className="fx fx-board"><BentoBoard page="solo-home" modules={modules} layout={b.layout} defaults={SOLO_BUILT_IN} saved={b.std} scope="standard" locked audience="Solo schools" /></div>;
}
