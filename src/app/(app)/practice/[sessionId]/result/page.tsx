import { notFound } from "next/navigation";
import { z } from "zod";
import { PracticeResult } from "@/components/practice/result";
export const metadata = { title: "Kết quả luyện tập" };
export default async function PracticeResultPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  if (!z.uuid().safeParse(sessionId).success) notFound();
  return <PracticeResult key={sessionId} sessionId={sessionId} />;
}
