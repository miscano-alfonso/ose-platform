import { redirect } from "next/navigation";

// Marketing emails now go through Admin → Newsletter (families who agreed to news and offers are on its list).
export default function Marketing() { redirect("/admin/newsletter"); }
