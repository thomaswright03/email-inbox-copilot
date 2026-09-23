import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";
import { PRIVACY_POLICY } from "@/content/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — Inbox Buddy",
};

export default function PrivacyPage() {
  return <LegalDocument title="Privacy Policy" content={PRIVACY_POLICY} />;
}
