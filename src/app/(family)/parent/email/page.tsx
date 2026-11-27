import { redirect } from "next/navigation";

// 27 Nov (Alfonso: Email and Messages are confusing for parents; one place): parents have Messages only. The school's emails
// are in their own inbox, and replying to a message's email goes back into that conversation (see syncInbox).
export default function ParentEmail() { redirect("/parent/messages"); }
