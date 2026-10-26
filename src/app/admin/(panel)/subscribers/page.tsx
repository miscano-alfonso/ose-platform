import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { newsletterBoot } from "../newsletter/boot";
import { NewsletterApp } from "../newsletter/NewsletterApp";
import "../newsletter/newsletter.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subscribers" };

export default async function Page() {
  await requireStaff();
  return <NewsletterApp boot={await newsletterBoot()} page="subscribers" />;
}
