import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { ProjectsBrowser } from "./ProjectsBrowser";

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
