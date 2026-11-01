import { permanentRedirect } from "next/navigation";

// The Teachers page is now People (1 Nov). Teachers' own profile pages stay at /teachers/<name>.
export default function Teachers() { permanentRedirect("/people"); }
