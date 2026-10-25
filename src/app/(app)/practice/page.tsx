import { PracticeSetup } from "@/components/practice/setup";
import { deckRefsSchema, deckGroupsSchema } from "@/lib/domain/decks";
import { notFound } from "next/navigation";
import { z } from "zod";
export const metadata = { title: "Luyện tập" };
export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const decks = deckRefsSchema.safeParse(params.decks?.split(",")),
    groups = deckGroupsSchema.safeParse(params.groups?.split(",").map(Number));
  if (
    (params.decks !== undefined && !decks.success) ||
    (params.groups !== undefined && !groups.success) ||
    (params.size !== undefined &&
      ![10, 15, 20, 25, 30].includes(Number(params.size))) ||
    (params.selection !== undefined &&
      !z.uuid().safeParse(params.selection).success)
  )
    notFound();
  return (
    <PracticeSetup
      seed={{
        band: params.band,
        topic: params.topic,
        group:
          params.group && /^\d+$/.test(params.group)
            ? Number(params.group)
            : undefined,
        entries: params.entries?.split(","),
        decks: decks.success ? decks.data : undefined,
        deckGroups: groups.success ? groups.data : undefined,
        deckFingerprint: params.version?.slice(0, 100),
        deckSize: params.size ? Number(params.size) : undefined,
        selection: params.selection,
      }}
    />
  );
}
