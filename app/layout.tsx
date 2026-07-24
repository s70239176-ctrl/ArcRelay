import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArcRelay — Agent Execution Workbench",
  description:
    "AI Agent Execution Workbench powered by Circle Agent Stack and Arc L1.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-slate-950 antialiased">{children}</body>
    </html>
  );
}
