import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500", "700", "800"],
});

export const metadata: Metadata = {
  title: "OpenBlueprint — open-source AI hardware design",
  description:
    "Describe a hardware project in plain English and get a complete, buildable design package: parts list, wiring diagram, mechanical assembly, and build instructions.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={jetbrains.variable}>
      <body>{children}</body>
    </html>
  );
}
