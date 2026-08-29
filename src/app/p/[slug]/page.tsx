import { notFound } from "next/navigation";
import { ProjectView } from "@/components/ProjectView";
import { getSeed } from "@/lib/design/seeds";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const record = getSeed(slug);
  if (!record) notFound();
  return <ProjectView record={record} />;
}
