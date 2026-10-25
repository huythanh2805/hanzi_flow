import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  const content = await readFile(
    path.join(process.cwd(), "data/imported/enrichment.json"),
    "utf8",
  );
  return new Response(content, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="hanziflow-licensed-content.json"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
