import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";
import { TERMS_OF_SERVICE } from "@/content/legal";

export const metadata: Metadata = {
  title: "Terms of Service — Inbox Buddy",
};

export default function TermsPage() {
  return <LegalDocument title="Terms of Service" content={TERMS_OF_SERVICE} />;
}
