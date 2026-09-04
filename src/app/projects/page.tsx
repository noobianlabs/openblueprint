import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { ProjectsBrowser } from "./ProjectsBrowser";

export const metadata: Metadata = {
  title: "My Projects",
  description: "Browse and manage your saved hardware design projects.",
  robots: {
    index: false,
  },
};

export default function ProjectsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex-1">
        <ProjectsBrowser />
      </main>
      <Footer />
    </div>
  );
}
