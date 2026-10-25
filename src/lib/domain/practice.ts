import { z } from "zod";
import { bands, type Vocabulary, type ProgressMap, type Sense } from "./types";
import { entryId } from "./validation";
import { deckSourceSchema } from "./decks";
export const exerciseTypes = [
  "meaning_choice",
  "listening_choice",
  "matching",
] as const;
export type ExerciseType = (typeof exerciseTypes)[number];
export type ChoiceSnapshot = Pick<
  PrivatePracticeQuestion,
  "prompt" | "promptPinyin" | "direction" | "options" | "correctOptionId"
>;

export const practiceSourceSchema = z.discriminatedUnion("kind", [
  deckSourceSchema,
  z.object({ kind: z.literal("band"), band: z.enum(bands) }).strict(),
  z
    .object({
      kind: z.literal("groups"),
      collectionType: z.enum(["band", "topic"]),
      collectionId: z.string().min(1).max(60),
      groups: z.array(z.number().int().min(1).max(2000)).min(1).max(2000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("personal"),
      filter: z.enum(["learned", "favorite", "difficult"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("entries"),
      ids: z.array(entryId).min(1).max(11092),
    })
    .strict(),
  z
    .object({
      kind: z.literal("retry"),
      parentId: z.uuid(),
      ids: z.array(entryId).min(1).max(11092),
    })
    .strict(),
]);
export const practiceStartSchema = z
  .object({
    requestId: z.uuid(),
    source: practiceSourceSchema,
    mode: z.enum(["learn", "exam"]),
    direction: z.enum(["mixed", "word-meaning", "meaning-word"]),
    language: z.enum(["vi", "en"]),
    exerciseTypes: z.array(z.enum(exerciseTypes)).min(1).max(3).optional(),
    lessonSize: z.union([
      z.literal(10),
      z.literal(15),
      z.literal(20),
      z.literal(25),
      z.literal(30),
    ]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.mode === "exam" &&
      v.exerciseTypes?.some((t) => t !== "meaning_choice")
    )
      ctx.addIssue({
        code: "custom",
        message: "Thi thử hiện chỉ hỗ trợ chọn chữ và nghĩa.",
      });
  });
export const practiceCommandSchema = z
  .object({
    eventId: z.uuid(),
    revision: z.number().int().min(0),
    kind: z.enum(["answer", "mark", "defer", "submit"]),
    ordinal: z.number().int().min(0).max(11091).optional(),
    optionId: z.uuid().optional(),
    marked: z.boolean().optional(),
    variant: z.enum(["primary", "choice"]).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.kind !== "submit" && v.ordinal === undefined)
      ctx.addIssue({ code: "custom", message: "Thiếu câu hỏi." });
    if (v.kind === "answer" && !v.optionId)
      ctx.addIssue({ code: "custom", message: "Thiếu đáp án." });
    if (v.kind === "mark" && v.marked === undefined)
      ctx.addIssue({ code: "custom", message: "Thiếu lựa chọn hỏi lại." });
  });
export type PracticeSource = z.infer<typeof practiceSourceSchema>;
export type PracticeStart = z.infer<typeof practiceStartSchema>;
export type PracticeCommand = z.infer<typeof practiceCommandSchema>;
export type PracticeMode = PracticeStart["mode"];
export type PracticeDirection = Exclude<PracticeStart["direction"], "mixed">;
export type PracticeOption = { id: string; label: string; pinyin?: string };
export type PracticeFeedback = {
  vocabularyId: string;
  word: string;
  pinyin: string;
  meaning: string;
  senseId: string;
  sourceId: string;
  sourceUrl?: string;
  attribution?: Sense["attribution"];
  translationMeta?: NonNullable<Sense["translation_meta"]>["vi"];
  correctOptionId: string;
  isCorrect: boolean | null;
};
export type PrivatePracticeQuestion = {
  ordinal: number;
  vocabularyId: string;
  direction: PracticeDirection;
  prompt: string;
  promptPinyin?: string;
  options: PracticeOption[];
  correctOptionId: string;
  feedback: Omit<PracticeFeedback, "correctOptionId" | "isCorrect">;
  exerciseType?: ExerciseType;
  choiceSnapshot?: ChoiceSnapshot;
  boardId?: string;
  boardOrdinals?: number[];
  audioText?: string;
};
export type PracticeQuestion = Omit<
  PrivatePracticeQuestion,
  | "vocabularyId"
  | "correctOptionId"
  | "feedback"
  | "choiceSnapshot"
  | "boardOrdinals"
> & {
  selectedOptionId: string | null;
  marked: boolean;
  deferred?: boolean;
  feedback?: PracticeFeedback;
  variant?: "primary" | "choice";
  resolved?: boolean;
  lastAttempt?: { optionId: string; isCorrect: boolean };
  board?: {
    id: string;
    members: {
      ordinal: number;
      word: string;
      pinyin: string;
      resolved: boolean;
      incorrect: boolean;
    }[];
    options: PracticeOption[];
  };
};
export type PracticeAnswer = {
  optionId: string | null;
  marked: boolean;
  repeatPending?: boolean;
  repeatOptionId?: string | null;
  repeatAttempt?: number;
  firstVariant?: "primary" | "choice";
  activeVariant?: "primary" | "choice";
  matchingResolved?: boolean;
  boardRemoved?: boolean;
  lastCorrect?: boolean;
};
export type PracticeSummary = {
  id: string;
  title: string;
  source: PracticeSource;
  mode: PracticeMode;
  direction: PracticeStart["direction"];
  language: "vi" | "en";
  lessonSize: number;
  total: number;
  status: "active" | "submitted";
  revision: number;
  cursor: number;
  answered: number;
  correct: number | null;
  wrong: number | null;
  unanswered: number;
  createdAt: string;
  submittedAt: string | null;
  parentId: string | null;
  deferredCount?: number;
  pendingCount?: number;
  repeatAnswered?: number;
  repeatCorrect?: number;
  exerciseTypes?: ExerciseType[];
  exerciseCounts?: Record<ExerciseType, number>;
  boardCount?: number;
  typeStats?: Record<ExerciseType, { answered: number; correct: number }>;
};
export type PrivatePracticeSession = Omit<
  PracticeSummary,
  "answered" | "correct" | "wrong" | "unanswered"
> & {
  answers: Record<number, PracticeAnswer>;
  correctCount: number;
  deferredOrdinals?: number[];
  learningQueue?: number[];
  activityByOrdinal?: Record<number, string>;
};
export type PracticeBatch = {
  session: PracticeSummary;
  questions: PracticeQuestion[];
};
export type PracticeLexeme = {
  id: string;
  band: string;
  word: string;
  pinyin: string;
  sourceOrder: number;
  meaning: string;
  aliases: string[];
  senseId: string;
  sourceId: string;
  sourceUrl?: string;
  attribution?: Sense["attribution"];
  translationMeta?: PracticeFeedback["translationMeta"];
};
export const practiceRank = (band: string) =>
  band === "7-9" ? 7 : Number(band);
export function meaningAliases(text: string): string[] {
  return [
    ...new Set(
      text
        .normalize("NFC")
        .toLocaleLowerCase()
        .split(/[;,；，/\n]/)
        .map((s) =>
          (s.replace(/\([^)]*\)|\[[^\]]*\]/g, "").trim() || s)
            .replace(/[^\p{L}\p{N}]+/gu, " ")
            .trim(),
        )
        .filter(Boolean),
    ),
  ];
}
export function practiceLexicon(
  rows: Vocabulary[],
  language: "vi" | "en",
): PracticeLexeme[] {
  return rows.map((v) => {
    const sense = v.senses.find(
      (s) => s[language]?.trim() && meaningAliases(s[language]!).length > 0,
    );
    const meaning = sense?.[language]?.trim() ?? "";
    return {
      id: v.id,
      band: v.band,
      word: v.word,
      pinyin: v.pinyin,
      sourceOrder: v.source_order,
      meaning,
      aliases: meaningAliases(meaning),
      senseId: sense?.id ?? "",
      sourceId: sense?.source_id ?? v.source_id,
      sourceUrl: sense?.source_url,
      attribution: sense?.attribution,
      translationMeta: sense?.translation_meta?.[language],
    };
  });
}
export function selectPracticeIds(
  rows: Vocabulary[],
  source: PracticeSource,
  size: number,
  progress: ProgressMap = {},
  parentIds?: string[],
): string[] {
  if (source.kind === "decks")
    throw new Error("Nguồn bộ từ cần được xác thực trước khi tạo bài.");
  const sorted = [...rows].sort(
    (a, b) =>
      practiceRank(a.band) - practiceRank(b.band) ||
      a.source_order - b.source_order,
  );
  if (source.kind === "entries" || source.kind === "retry") {
    const ids = [...new Set(source.ids)];
    const available = new Set(rows.map((v) => v.id));
    if (
      ids.some((id) => !available.has(id)) ||
      (source.kind === "retry" &&
        (!parentIds || ids.some((id) => !parentIds.includes(id))))
    )
      throw new Error("Danh sách từ không hợp lệ.");
    return ids;
  }
  if (source.kind === "band")
    return sorted.filter((v) => v.band === source.band).map((v) => v.id);
  if (source.kind === "personal")
    return sorted
      .filter((v) => {
        const p = progress[v.id];
        return source.filter === "learned"
          ? !!p && p.state !== "NEW"
          : !!p?.[source.filter];
      })
      .map((v) => v.id);
  if (
    source.collectionType === "band" &&
    !bands.includes(source.collectionId as (typeof bands)[number])
  )
    throw new Error("Band không hợp lệ.");
  const collection = sorted.filter((v) =>
    source.collectionType === "band"
      ? v.band === source.collectionId
      : v.topics.includes(source.collectionId),
  );
  const groups = new Set(source.groups);
  if ([...groups].some((n) => n > Math.ceil(collection.length / size)))
    throw new Error("Nhóm đã thay đổi. Hãy chọn lại nhóm.");
  return collection
    .filter((_, index) => groups.has(Math.floor(index / size) + 1))
    .map((v) => v.id);
}
function randomFor(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffled<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function buildPracticeQuestions(
  lexicon: PracticeLexeme[],
  ids: string[],
  direction: PracticeStart["direction"],
  seed: string,
  uuid: () => string,
): PrivatePracticeQuestion[] {
  if (!ids.length) throw new Error("Chưa có từ phù hợp để luyện tập.");
  const index = new Map(lexicon.map((v) => [v.id, v]));
  const missing = ids.filter(
    (id) => !index.get(id)?.meaning || !index.get(id)?.aliases.length,
  );
  if (missing.length)
    throw new Error(
      `Không thể tạo bài đầy đủ: ${missing.length} mục thiếu nghĩa (${missing.slice(0, 8).join(", ")}).`,
    );
  const random = randomFor(seed),
    order = shuffled([...new Set(ids)], random);
  const pools = new Map<string, PracticeLexeme[]>(),
    sameCounts = new Map<string, number>();
  for (const band of bands) {
    const same = shuffled(
        lexicon.filter((v) => v.meaning && v.band === band),
        random,
      ),
      lower = shuffled(
        lexicon.filter(
          (v) => v.meaning && practiceRank(v.band) < practiceRank(band),
        ),
        random,
      );
    pools.set(band, [...same, ...lower]);
    sameCounts.set(band, same.length);
  }
  const spellingCounts = new Map<string, number>();
  lexicon.forEach((v) =>
    spellingCounts.set(v.word, (spellingCounts.get(v.word) ?? 0) + 1),
  );
  return order.map((id, ordinal) => {
    const target = index.get(id)!;
    const candidates = pools.get(target.band)!;
    const chosen = [target],
      usedWords = new Set([target.word]),
      usedAliases = new Set(target.aliases);
    // Rotate within the same-Band portion, then fall back to lower Bands.
    const sameCount = sameCounts.get(target.band)!;
    const offset = Math.floor(random() * Math.max(sameCount, 1));
    for (let i = 0; i < candidates.length && chosen.length < 4; i++) {
      const candidate =
        i < sameCount ? candidates[(offset + i) % sameCount] : candidates[i];
      if (
        usedWords.has(candidate.word) ||
        candidate.aliases.some((a) => usedAliases.has(a)) ||
        chosen.some(
          (c) =>
            c.meaning.toLocaleLowerCase() ===
            candidate.meaning.toLocaleLowerCase(),
        )
      )
        continue;
      chosen.push(candidate);
      usedWords.add(candidate.word);
      candidate.aliases.forEach((a) => usedAliases.add(a));
    }
    if (chosen.length !== 4)
      throw new Error(
        `Không đủ đáp án phân biệt cho ${id}. Chưa tạo bài; không bỏ qua mục từ.`,
      );
    const kind: PracticeDirection =
      direction === "mixed"
        ? ordinal % 2
          ? "meaning-word"
          : "word-meaning"
        : direction;
    const options = shuffled(chosen, random).map((v) => ({
      id: uuid(),
      label: kind === "word-meaning" ? v.meaning : v.word,
    }));
    const correctOptionId = options.find(
      (o) =>
        o.label === (kind === "word-meaning" ? target.meaning : target.word),
    )!.id;
    return {
      ordinal,
      vocabularyId: id,
      direction: kind,
      prompt: kind === "word-meaning" ? target.word : target.meaning,
      promptPinyin:
        kind === "word-meaning" && (spellingCounts.get(target.word) ?? 0) > 1
          ? target.pinyin
          : undefined,
      options,
      correctOptionId,
      feedback: {
        vocabularyId: id,
        word: target.word,
        pinyin: target.pinyin,
        meaning: target.meaning,
        senseId: target.senseId,
        sourceId: target.sourceId,
        sourceUrl: target.sourceUrl,
        attribution: target.attribution,
        translationMeta: target.translationMeta,
      },
    };
  });
}
export function practiceSummary(
  session: PrivatePracticeSession,
  questions?: PrivatePracticeQuestion[],
): PracticeSummary {
  const answers = Object.values(session.answers).filter((a) => a.optionId),
    answered = answers.length;
  const visible = session.mode === "learn" || session.status === "submitted";
  const correct = visible
    ? questions
      ? questions.filter(
          (q) =>
            session.answers[q.ordinal]?.optionId ===
            practiceVariant(q, session.answers[q.ordinal]?.firstVariant)
              .correctOptionId,
        ).length
      : session.correctCount
    : null;
  const typeStats = questions
    ? (Object.fromEntries(
        exerciseTypes.map((type) => {
          const subset = questions.filter(
            (q) =>
              (session.answers[q.ordinal]?.firstVariant === "choice"
                ? "meaning_choice"
                : (q.exerciseType ?? "meaning_choice")) === type,
          );
          return [
            type,
            {
              answered: subset.filter(
                (q) => !!session.answers[q.ordinal]?.optionId,
              ).length,
              correct: subset.filter(
                (q) =>
                  session.answers[q.ordinal]?.optionId ===
                  practiceVariant(q, session.answers[q.ordinal]?.firstVariant)
                    .correctOptionId,
              ).length,
            },
          ];
        }),
      ) as PracticeSummary["typeStats"])
    : session.typeStats;
  const {
    answers: _,
    correctCount: __,
    deferredOrdinals,
    learningQueue: ___,
    activityByOrdinal: ____,
    ...meta
  } = session;
  void _;
  void __;
  void ___;
  void ____;
  return {
    ...meta,
    typeStats: visible ? typeStats : undefined,
    deferredCount: (deferredOrdinals ?? []).length,
    pendingCount:
      session.mode === "learn"
        ? practiceLearningQueue(session).length
        : session.total - answered,
    repeatAnswered: session.repeatAnswered ?? 0,
    repeatCorrect: session.repeatCorrect ?? 0,
    answered,
    unanswered: session.total - answered,
    correct,
    wrong: correct === null ? null : answered - correct,
  };
}
export function publicPracticeQuestion(
  q: PrivatePracticeQuestion,
  session: PrivatePracticeSession,
  context: PrivatePracticeQuestion[] = [q],
): PracticeQuestion {
  const answer = session.answers[q.ordinal];
  const variant =
    session.status === "submitted"
      ? (answer?.firstVariant ?? "primary")
      : (answer?.activeVariant ?? "primary");
  const view = practiceVariant(q, variant);
  const type =
    variant === "choice"
      ? "meaning_choice"
      : (q.exerciseType ?? "meaning_choice");
  const matching = type === "matching" && session.status !== "submitted";
  const selected =
    session.status === "submitted" || session.mode === "exam"
      ? answer?.optionId
      : answer?.repeatPending
        ? null
        : (answer?.repeatOptionId ?? answer?.optionId);
  const show =
    session.status === "submitted" ||
    (session.mode === "learn" &&
      !!selected &&
      (!matching || !!answer?.matchingResolved));
  return {
    ordinal: q.ordinal,
    direction: view.direction,
    prompt: view.prompt,
    promptPinyin: view.promptPinyin,
    options: view.options,
    exerciseType: type,
    variant,
    audioText: type === "listening_choice" ? q.audioText : undefined,
    selectedOptionId:
      matching && !answer?.matchingResolved ? null : (selected ?? null),
    resolved: !!answer?.matchingResolved,
    ...(matching && selected && answer?.lastCorrect === false
      ? { lastAttempt: { optionId: selected, isCorrect: false } }
      : {}),
    ...(matching
      ? {
          board: {
            id: q.boardId!,
            members: context
              .filter(
                (v) =>
                  v.boardId === q.boardId &&
                  !session.answers[v.ordinal]?.boardRemoved,
              )
              .map((v) => ({
                ordinal: v.ordinal,
                word: v.feedback.word,
                pinyin: v.feedback.pinyin,
                resolved: !!session.answers[v.ordinal]?.matchingResolved,
                incorrect: session.answers[v.ordinal]?.lastCorrect === false,
              })),
            options: q.options.filter(
              (o) =>
                !context.some(
                  (v) =>
                    v.boardId === q.boardId &&
                    session.answers[v.ordinal]?.boardRemoved &&
                    v.correctOptionId === o.id,
                ),
            ),
          },
        }
      : {}),
    marked: answer?.marked ?? false,
    deferred: (session.deferredOrdinals ?? []).includes(q.ordinal),
    ...(show
      ? {
          feedback: {
            ...q.feedback,
            correctOptionId: view.correctOptionId,
            isCorrect: selected ? selected === view.correctOptionId : null,
          },
        }
      : {}),
  };
}
export function practiceVariant(
  q: PrivatePracticeQuestion,
  variant?: "primary" | "choice",
): ChoiceSnapshot {
  return variant === "choice" && q.choiceSnapshot ? q.choiceSnapshot : q;
}
export function practiceLearningQueue(
  session: PrivatePracticeSession,
): number[] {
  if (session.learningQueue) return [...session.learningQueue];
  const pending = Array.from({ length: session.total }, (_, n) => n).filter(
    (n) => !session.answers[n]?.optionId || session.answers[n]?.repeatPending,
  );
  const deferred = new Set(session.deferredOrdinals ?? []);
  return [
    ...pending.filter((n) => !deferred.has(n)),
    ...(session.deferredOrdinals ?? []).filter((n) => pending.includes(n)),
  ];
}
export function practiceRepeatSlot(eventId: string, remaining: number) {
  return remaining === 0
    ? 0
    : 1 + (parseInt(eventId.replaceAll("-", "").slice(-8), 16) % remaining);
}
export function applyPracticeCommand(
  session: PrivatePracticeSession,
  q: PrivatePracticeQuestion | undefined,
  command: PracticeCommand,
  now = new Date(),
): PrivatePracticeSession {
  if (session.revision !== command.revision) throw new Error("STALE_REVISION");
  if (session.status !== "active")
    throw new Error("Phiên đã nộp; không thể sửa kết quả.");
  const next = {
    ...session,
    answers: { ...session.answers },
    revision: session.revision + 1,
  };
  if (command.kind === "submit")
    return { ...next, status: "submitted", submittedAt: now.toISOString() };
  if (!q || q.ordinal !== command.ordinal)
    throw new Error("Câu hỏi không hợp lệ.");
  const previous = session.answers[q.ordinal] ?? {
    optionId: null,
    marked: false,
  };
  const variant = previous.activeVariant ?? "primary";
  if (command.kind === "answer" && (command.variant ?? "primary") !== variant)
    throw new Error("Biến thể câu hỏi đã thay đổi. Hãy tải lại.");
  const view = practiceVariant(q, variant);
  const matching = q.exerciseType === "matching" && variant === "primary";
  const queue = practiceLearningQueue(session).filter((n) => n !== q.ordinal);
  if (command.kind === "defer") {
    if (session.mode !== "learn")
      throw new Error("Chỉ hỏi lại trong Luyện học.");
    if (!previous.optionId && queue.length === 0)
      throw new Error("Đây là từ cuối cùng chưa trả lời.");
    next.answers[q.ordinal] = {
      ...previous,
      marked: true,
      ...(q.choiceSnapshot && q.exerciseType !== "meaning_choice"
        ? { activeVariant: "choice" as const, boardRemoved: true }
        : {}),
      ...(previous.optionId
        ? {
            repeatPending: true,
            repeatOptionId: null,
            repeatAttempt:
              (previous.repeatAttempt ?? 0) + (previous.repeatPending ? 0 : 1),
          }
        : {}),
    };
    next.deferredOrdinals = [
      ...(session.deferredOrdinals ?? []).filter((n) => n !== q.ordinal),
      q.ordinal,
    ];
    const boundaries = queue
      .map((n, i) => {
        const key = (ord: number) =>
          session.answers[ord]?.activeVariant === "choice"
            ? String(ord)
            : (session.activityByOrdinal?.[ord] ?? String(ord));
        return i === queue.length - 1 || key(n) !== key(queue[i + 1])
          ? i + 1
          : -1;
      })
      .filter((n) => n >= 0);
    const position =
      boundaries[practiceRepeatSlot(command.eventId, boundaries.length) - 1] ??
      0;
    queue.splice(position, 0, q.ordinal);
  } else if (command.kind === "answer") {
    if (!view.options.some((o) => o.id === command.optionId))
      throw new Error("Đáp án không hợp lệ.");
    if (
      session.mode === "learn" &&
      previous.optionId &&
      !previous.repeatPending &&
      !(matching && !previous.matchingResolved)
    )
      throw new Error("Câu đã chấm không thể sửa.");
    if (session.mode === "learn" && previous.optionId) {
      next.answers[q.ordinal] = {
        ...previous,
        repeatPending: false,
        repeatOptionId: command.optionId!,
        lastCorrect: command.optionId === view.correctOptionId,
        ...(matching
          ? { matchingResolved: command.optionId === view.correctOptionId }
          : {}),
      };
      next.repeatAnswered = (session.repeatAnswered ?? 0) + 1;
      next.repeatCorrect =
        (session.repeatCorrect ?? 0) +
        (command.optionId === view.correctOptionId ? 1 : 0);
    } else {
      const stats = Object.fromEntries(
        exerciseTypes.map((type) => [
          type,
          {
            ...(session.typeStats?.[type] ?? {
              answered:
                type === "meaning_choice"
                  ? Object.values(session.answers).filter((a) => !!a.optionId)
                      .length
                  : 0,
              correct: type === "meaning_choice" ? session.correctCount : 0,
            }),
          },
        ]),
      ) as NonNullable<PracticeSummary["typeStats"]>;
      const type =
        variant === "choice"
          ? "meaning_choice"
          : (q.exerciseType ?? "meaning_choice");
      if (previous.optionId) {
        const oldType =
          previous.firstVariant === "choice"
            ? "meaning_choice"
            : (q.exerciseType ?? "meaning_choice");
        stats[oldType].answered--;
        stats[oldType].correct -= Number(
          previous.optionId ===
            practiceVariant(q, previous.firstVariant).correctOptionId,
        );
      }
      stats[type].answered++;
      stats[type].correct += Number(command.optionId === view.correctOptionId);
      next.typeStats = stats;
      next.answers[q.ordinal] = {
        ...previous,
        optionId: command.optionId!,
        firstVariant: variant,
        lastCorrect: command.optionId === view.correctOptionId,
        ...(matching
          ? { matchingResolved: command.optionId === view.correctOptionId }
          : {}),
      };
      next.correctCount =
        session.correctCount +
        (command.optionId === view.correctOptionId ? 1 : 0) -
        (previous.optionId ===
        practiceVariant(q, previous.firstVariant).correctOptionId
          ? 1
          : 0);
    }
    next.cursor = Math.min(q.ordinal + 1, session.total - 1);
    next.deferredOrdinals = (session.deferredOrdinals ?? []).filter(
      (n) => n !== q.ordinal,
    );
    if (matching && command.optionId !== view.correctOptionId) {
      const oldQueue = practiceLearningQueue(session);
      queue.splice(0, queue.length, ...oldQueue);
    }
  } else next.answers[q.ordinal] = { ...previous, marked: command.marked! };
  if (
    session.mode === "learn" &&
    (command.kind === "answer" || command.kind === "defer")
  ) {
    next.learningQueue = queue;
    next.cursor = queue[0] ?? q.ordinal;
  }
  return next;
}
