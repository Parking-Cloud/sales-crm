import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = { title: "Oggi" };

export default function TodayPage() {
  return <PagePlaceholder title="Oggi" />;
}
