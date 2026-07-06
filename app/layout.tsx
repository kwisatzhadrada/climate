import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Resilience Platform — Climate & Community Resilience, Personalized",
  description:
    "AI-powered climate risk audits, adaptation plans, and resilience tools for your home and community.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main className="min-h-[calc(100vh-65px)]">{children}</main>
      </body>
    </html>
  );
}
