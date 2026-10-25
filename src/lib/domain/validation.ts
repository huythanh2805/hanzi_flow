import { z } from "zod";
export const entryId = z.string().regex(/^hsk30-b(?:[1-6]|79)-\d{4}$/);
export const progressPatchSchema = z
  .object({
    state: z.literal("LEARNING").optional(),
    favorite: z.boolean().optional(),
    difficult: z.boolean().optional(),
    suspended: z.boolean().optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0, "Empty update");
export const preferencesSchema = z
  .object({
    dailyGoal: z.number().int().min(1).max(100),
    lessonSize: z.union([
      z.literal(10),
      z.literal(15),
      z.literal(20),
      z.literal(25),
      z.literal(30),
    ]),
    preferredBand: z.enum(["1", "2", "3", "4", "5", "6", "7-9"]),
    preferredTopics: z.array(z.string().max(60)).max(20),
    language: z.enum(["vi", "en"]),
    showPinyin: z.boolean(),
    autoPlay: z.boolean(),
    speechRate: z.number().min(0.5).max(1.5),
    theme: z.enum(["light", "dark", "system"]),
    timeZone: z.string().refine((zone) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }, "Invalid IANA time zone"),
  })
  .strict();
export const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự.").max(128),
});
export const filterSchema = z.object({
  query: z.string().max(100).default(""),
  band: z.enum(["", "1", "2", "3", "4", "5", "6", "7-9"]).default(""),
  topic: z.string().max(60).default(""),
  state: z.enum(["", "NEW", "LEARNING", "MASTERED"]).default(""),
  favorite: z.boolean().default(false),
  difficult: z.boolean().default(false),
  sort: z.enum(["order", "band", "progress"]).default("order"),
  page: z.coerce.number().int().min(1).max(2000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});
