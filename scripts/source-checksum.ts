import { createHash } from "node:crypto";

/** Hash UTF-8 source text with LF endings, independent of Git checkout settings. */
export function sourceChecksum(source: string) {
  return createHash("sha256")
    .update(source.replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
}
