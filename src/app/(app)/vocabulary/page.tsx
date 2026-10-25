import { VocabularyLibrary } from "@/components/vocabulary-library";
import { searchCatalogue } from "@/lib/server/catalogue";
import { filterSchema } from "@/lib/domain/validation";
export const metadata = { title: "Thư viện từ vựng" };
export default async function VocabularyPage() {
  return (
    <VocabularyLibrary
      initial={await searchCatalogue(filterSchema.parse({}))}
    />
  );
}
