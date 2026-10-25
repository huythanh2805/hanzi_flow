import { z } from "zod";
import { searchCatalogue } from "@/lib/server/catalogue";
import { entryId, filterSchema } from "@/lib/domain/validation";
import type { ProgressMap } from "@/lib/domain/types";
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 3_000_000)
      return Response.json({ error: "Yêu cầu quá lớn." }, { status: 413 });
    const body = z
      .object({
        filters: filterSchema,
        trialProgress: z
          .record(
            entryId,
            z.object({
              vocabulary_id: entryId,
              state: z.enum(["NEW", "LEARNING", "MASTERED"]),
              favorite: z.boolean(),
              difficult: z.boolean(),
              suspended: z.boolean(),
              studied_at: z.string().nullable(),
              updated_at: z.string(),
            }),
          )
          .optional(),
      })
      .parse(await request.json());
    const result = await searchCatalogue(
      body.filters,
      body.trialProgress as ProgressMap | undefined,
    );
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json({ error: "Bộ lọc không hợp lệ." }, { status: 400 });
    const message =
      error instanceof Error ? error.message : "Không thể tải từ vựng.";
    return Response.json(
      {
        error:
          message === "UNAUTHORIZED"
            ? "Phiên đăng nhập đã hết hạn."
            : "Không thể tải từ vựng. Kiểm tra cấu hình và thử lại.",
      },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
