import React from "react";
import ChatInterface from "./_components/ChatInterface";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rekomendasi Mobil AI | Toyota Rantauprapat",
  description:
    "Dapatkan rekomendasi mobil Toyota yang sesuai dengan kebutuhan Anda menggunakan teknologi AI RAG (Retrieval-Augmented Generation). Temukan mobil impian Anda dengan bantuan sistem rekomendasi pintar kami.",
  keywords:
    "rekomendasi mobil toyota, ai toyota, mobil toyota sesuai kebutuhan, sistem rekomendasi mobil, toyota rantauprapat, RAG AI",
  openGraph: {
    title: "Rekomendasi Mobil AI Toyota Rantauprapat",
    description:
      "Temukan mobil Toyota yang tepat untuk Anda dengan bantuan AI RAG",
    locale: "id_ID",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://www.toyotarantauprapat.com/rekomendasi-ai",
  },
  authors: [{ name: "Toyota Rantauprapat" }],
  category: "Automotive",
  verification: {
    google: "24f9cc081f9ae37b",
  },
};

function RekomendasiAI() {
  return (
    <div className="h-auto min-h-screen w-full">
      <ChatInterface />
    </div>
  );
}

export default RekomendasiAI;
