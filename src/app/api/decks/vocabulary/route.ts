import { deckVocabularyBatch } from "@/app/deck-actions";
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 30000)
      return Response.json({ error: "Yêu cầu quá lớn." }, { status: 413 });
    const value = await deckVocabularyBatch(await request.json());
    if (!value.ok)
      return Response.json(
        { error: value.error },
        { status: value.error.includes("đăng nhập") ? 401 : 400 },
      );
    return Response.json(value.data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "Không tải được từ vựng. Hãy thử lại." },
      { status: 400 },
    );
  }
}
