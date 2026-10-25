import { notFound } from "next/navigation";
import { getVocabulary } from "@/lib/server/catalogue";
import { entryId } from "@/lib/domain/validation";
import { VocabularyDetail } from "@/components/vocabulary-detail";
export const metadata = { title: "Chi tiết từ vựng" };
export default async function DetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!entryId.safeParse(id).success) notFound();
  const v = await getVocabulary(id);
  if (!v) notFound();
  return <VocabularyDetail vocabulary={v} />;
}
