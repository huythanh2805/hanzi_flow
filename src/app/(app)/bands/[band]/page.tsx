import { notFound } from "next/navigation";
import { CollectionDetail } from "@/components/collections";
import { searchCatalogue } from "@/lib/server/catalogue";
import { filterSchema } from "@/lib/domain/validation";
import { bands } from "@/lib/domain/types";
export const metadata = { title: "Học theo HSK Band" };
export default async function BandPage({
  params,
}: {
  params: Promise<{ band: string }>;
}) {
  const { band } = await params;
  if (!bands.some((b) => b === band)) notFound();
  return (
    <CollectionDetail
      band={band}
      initial={await searchCatalogue(filterSchema.parse({ band }))}
    />
  );
}
