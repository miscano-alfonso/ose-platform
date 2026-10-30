import { requireViewer } from "@/lib/auth";
import { boardLayout } from "@/lib/dashboard-layout";
import { BOARD_MODULES } from "@/lib/dash-modules";
import { BentoBoard } from "../../BentoBoard";
import { teacherModules, TEACHER_BUILT_IN as BUILT_IN } from "../../dash/teacher-board";

export const dynamic = "force-dynamic";

// My day: the teacher's Bento dashboard: next lesson with Join up top, reports in lime, then the week.
export default async function MyDay() {
  const me = await requireViewer();
  const modules = await teacherModules(me);
  const known = BOARD_MODULES["teacher-home"];
  const b = await boardLayout("teacher-home", null, known, BUILT_IN);
  return <div className="fx fx-board">
    <BentoBoard page="teacher-home" modules={modules} layout={b.layout} defaults={BUILT_IN}
      saved={b.std} scope="standard" locked={!me.viewing || b.mirrored} audience="teachers" />
  </div>;
}

