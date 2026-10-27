"use server";
import { redirect } from "next/navigation";
import { startPublicDemo } from "@/lib/demo";

export async function openDemo() {
  const err = await startPublicDemo();
  if (err) redirect(`/osedtech/demo?error=${encodeURIComponent(err)}`);
  redirect("/admin");
}
