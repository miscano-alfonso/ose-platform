import { redirect } from "next/navigation";

// ose…/studio: the Sketch Studio lives under /admin, where the admin sign-in applies.
export const dynamic = "force-dynamic";
export default function Studio() { redirect("/admin/studio"); }
