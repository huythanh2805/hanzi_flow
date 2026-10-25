import { notFound } from "next/navigation";
import { CollectionDetail } from "@/components/collections";
import { getBootstrap, searchCatalogue } from "@/lib/server/catalogue";
import { filterSchema } from "@/lib/domain/validation";
export const metadata = { title: "Học theo chủ đề" };
export default async function TopicPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic: id } = await params;
  const bootstrap = await getBootstrap();
  const topic = bootstrap.topics.find((t) => t.id === id);
  if (!topic) notFound();
  return (
    <CollectionDetail
      topic={topic}
      initial={await searchCatalogue(filterSchema.parse({ topic: id }))}
    />
  );
}
