import { notFound } from "next/navigation";
import { DeckDetail } from "@/components/decks/detail";
import { deckRefSchema } from "@/lib/domain/decks";
export const metadata = { title: "Bộ từ cá nhân" };
export default async function DeckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!deckRefSchema.safeParse(id).success) notFound();
  return <DeckDetail id={id} />;
}
