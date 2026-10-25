import { notFound } from "next/navigation";
import { z } from "zod";
import { PracticePlayer } from "@/components/practice/player";
export const metadata = { title: "Bài luyện tập" };
export default async function PracticeSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  if (!z.uuid().safeParse(sessionId).success) notFound();
  return <PracticePlayer key={sessionId} sessionId={sessionId} />;
}
