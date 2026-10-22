import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = { title: "Analytics" };

// Placeholder: the analytics come with the next block.
export default function AnalyticsPage() {
  return <PagePlaceholder title="Analytics" detail="numeri di prospect, pipeline e offerte." />;
}
