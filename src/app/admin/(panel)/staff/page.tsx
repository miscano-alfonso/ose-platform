import { redirect } from "next/navigation";

// 27 Nov: Staff & access joined Teachers as one page (next.config.ts redirects /admin/staff there first).
export default function Staff() { redirect("/admin/teachers"); }
