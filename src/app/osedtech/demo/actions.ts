"use server";
import { redirect } from "next/navigation";
import { startPublicDemo } from "@/lib/demo";

export async function openDemo(f?: FormData) {
  const err = await startPublicDemo(f?.get("school") === "solo" ? "solo" : "academy");
  if (err) redirect(`/osedtech/demo?error=${encodeURIComponent(err)}`);
  redirect("/admin");
}
