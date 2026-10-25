import { PracticeSetup } from "@/components/practice/setup";
export const metadata = { title: "Luyện tập" };
export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
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
      }}
    />
  );
}
