import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ),
  title: {
    default: "OpenBlueprint",
    template: "%s — OpenBlueprint",
  },
  description:
    "An open-source tool that turns a hardware idea into a buildable design package. Describe a project, get parts, wiring, mechanics, and build instructions—entirely in your browser, no account required.",
  applicationName: "OpenBlueprint",
  openGraph: {
    siteName: "OpenBlueprint",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
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
