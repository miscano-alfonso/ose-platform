import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { newsletterBoot } from "./boot";
import { NewsletterApp } from "./NewsletterApp";
import "./newsletter.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Newsletter" };

export default async function Page() {
  await requireStaff();
  return <NewsletterApp boot={await newsletterBoot()} page="email" />;
}
