import { notFound } from "next/navigation";
import { Flashcards } from "@/components/flashcards";
import {
  getBootstrap,
  getVocabulary,
  searchCatalogue,
} from "@/lib/server/catalogue";
import { entryId, filterSchema } from "@/lib/domain/validation";
export const metadata = { title: "Flashcards" };
export default async function FlashcardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const bootstrap = await getBootstrap();
  if (params.entry) {
    if (!entryId.safeParse(params.entry).success) notFound();
    const entry = await getVocabulary(params.entry);
    if (!entry) notFound();
    return <Flashcards key={entry.id} initial={[entry]} singleEntry />;
  }
  const parsed = filterSchema.safeParse({
    band: params.band ?? "",
    topic: params.topic ?? "",
    page: params.lesson ?? 1,
    pageSize: bootstrap.preferences.lessonSize,
  });
  if (!parsed.success) notFound();
  const result = await searchCatalogue(parsed.data);
  return (
    <Flashcards
      key={`${parsed.data.band}:${parsed.data.topic}:${parsed.data.page}:${bootstrap.preferences.lessonSize}`}
      initial={result.items}
      initialBand={parsed.data.band}
      initialTopic={parsed.data.topic}
      lesson={bootstrap.mode === "trial" ? parsed.data.page : result.page}
    />
  );
}
