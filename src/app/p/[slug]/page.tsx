import { ProjectResolver } from "./ProjectResolver";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProjectResolver slug={slug} />;
}
