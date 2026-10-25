import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { practiceLexicon } from "@/lib/domain/practice";
import type { Vocabulary } from "@/lib/domain/types";
import {
  buildExerciseQuestions,
  exerciseSessionState,
  hearingKey,
} from "@/lib/domain/practice-exercises";
import {
  applyPracticeCommand,
  practiceStartSchema,
  practiceSummary,
  publicPracticeQuestion,
  type PracticeLexeme,
  type PrivatePracticeSession,
  type ExerciseType,
} from "@/lib/domain/practice";
const lex: PracticeLexeme[] = Array.from({ length: 12 }, (_, i) => ({
  id: `hsk30-b1-${String(i + 1).padStart(4, "0")}`,
  word: `词${i}`,
  pinyin: `ci${i + 1}`,
  band: "1",
  sourceOrder: i,
  meaning: `definition ${i}`,
  aliases: [`definition ${i}`],
  senseId: "s",
  sourceId: "test",
}));
const build = (n: number, types: ExerciseType[]) =>
  buildExerciseQuestions(
    lex,
    lex.slice(0, n).map((v) => v.id),
    "mixed",
    "seed",
    randomUUID,
    types,
  );
function session(
  questions: ReturnType<typeof build>["questions"],
): PrivatePracticeSession {
  return {
    id: randomUUID(),
    title: "Test",
    source: { kind: "entries", ids: questions.map((q) => q.vocabularyId) },
    mode: "learn",
    direction: "mixed",
    language: "en",
    lessonSize: 20,
    total: questions.length,
    status: "active",
    revision: 0,
    createdAt: new Date().toISOString(),
    submittedAt: null,
    parentId: null,
    answers: {},
    correctCount: 0,
    ...exerciseSessionState(questions),
  };
}
describe("practice exercise snapshots", () => {
  it("allocates all 5,636 real Band 7–9 IDs once with all three exercise types", async () => {
    const rows = JSON.parse(
      await readFile("data/catalogue.json", "utf8"),
    ) as Vocabulary[];
    const ids = rows.filter((v) => v.band === "7-9").map((v) => v.id);
    const built = buildExerciseQuestions(
      practiceLexicon(rows, "en"),
      ids,
      "mixed",
      "full-band",
      randomUUID,
      ["meaning_choice", "listening_choice", "matching"],
    );
    expect(built.questions.map((q) => q.vocabularyId).sort()).toEqual(
      ids.sort(),
    );
    expect(Object.values(built.counts).reduce((a, b) => a + b, 0)).toBe(5636);
    expect(Object.values(built.counts).every((n) => n > 0)).toBe(true);
    for (const q of built.questions.filter(
      (q) => q.exerciseType === "matching",
    ))
      expect(q.boardOrdinals!.length).toBeGreaterThanOrEqual(2);
  });
  it("balances the three types by canonical word count without duplicate targets", () => {
    const b = build(12, ["meaning_choice", "listening_choice", "matching"]);
    expect(b.counts).toEqual({
      meaning_choice: 4,
      listening_choice: 4,
      matching: 4,
    });
    expect(new Set(b.questions.map((q) => q.vocabularyId)).size).toBe(12);
    expect(b.boardCount).toBe(1);
    expect(new Set(exerciseSessionState(b.questions).learningQueue).size).toBe(
      12,
    );
    for (const q of b.questions)
      expect(q.choiceSnapshot?.options).toHaveLength(4);
  });
  it("packs boards into 2–4 pairs, redistributing a singleton", () => {
    for (let n = 2; n <= 12; n++) {
      const b = build(n, ["matching"]),
        boards = new Map<string, number>();
      for (const q of b.questions)
        boards.set(q.boardId!, (boards.get(q.boardId!) ?? 0) + 1);
      expect([...boards.values()].every((n) => n >= 2 && n <= 4)).toBe(true);
      expect(b.counts.matching).toBe(n);
    }
    expect(() => build(1, ["matching"])).toThrow();
    expect(build(1, ["matching", "meaning_choice"]).questions).toHaveLength(1);
  });
  it("keeps failed matching keys private, allows retry, and freezes first score", () => {
    const { questions } = build(4, ["matching"]),
      q = questions[0];
    let s = session(questions);
    const wrong = q.options.find((o) => o.id !== q.correctOptionId)!.id;
    s = applyPracticeCommand(s, q, {
      kind: "answer",
      eventId: randomUUID(),
      revision: 0,
      ordinal: q.ordinal,
      optionId: wrong,
    });
    const publicQ = publicPracticeQuestion(q, s, questions);
    expect(publicQ.feedback).toBeUndefined();
    expect(publicQ.selectedOptionId).toBeNull();
    expect(publicQ.lastAttempt?.optionId).toBe(wrong);
    expect(s.learningQueue).toContain(q.ordinal);
    s = applyPracticeCommand(s, q, {
      kind: "answer",
      eventId: randomUUID(),
      revision: 1,
      ordinal: q.ordinal,
      optionId: q.correctOptionId,
    });
    expect(s.answers[q.ordinal].matchingResolved).toBe(true);
    expect(s.learningQueue).not.toContain(q.ordinal);
    expect(practiceSummary(s, questions)).toMatchObject({
      correct: 0,
      wrong: 1,
      repeatAnswered: 1,
      repeatCorrect: 1,
    });
  });
  it("defers one pair to MCQ and grades the actual first variant", () => {
    const { questions } = build(8, ["matching"]),
      q = questions[0];
    let s = session(questions);
    s = applyPracticeCommand(s, q, {
      kind: "defer",
      eventId: randomUUID(),
      revision: 0,
      ordinal: q.ordinal,
    });
    expect(publicPracticeQuestion(q, s, questions)).toMatchObject({
      exerciseType: "meaning_choice",
      variant: "choice",
    });
    const other = questions.find((v) => v.boardId === q.boardId && v !== q)!;
    expect(
      publicPracticeQuestion(other, s, questions).board?.members,
    ).toHaveLength(3);
    expect(
      publicPracticeQuestion(other, s, questions).board?.options,
    ).toHaveLength(3);
    expect(() =>
      applyPracticeCommand(s, q, {
        kind: "answer",
        eventId: randomUUID(),
        revision: 1,
        ordinal: q.ordinal,
        optionId: q.correctOptionId,
      }),
    ).toThrow();
    s = applyPracticeCommand(s, q, {
      kind: "answer",
      eventId: randomUUID(),
      revision: 1,
      ordinal: q.ordinal,
      optionId: q.choiceSnapshot!.correctOptionId,
      variant: "choice",
    });
    expect(practiceSummary(s, questions).correct).toBe(1);
    expect(
      practiceSummary(s, questions).typeStats?.meaning_choice.correct,
    ).toBe(1);
    expect(
      publicPracticeQuestion(q, { ...s, status: "submitted" }, questions)
        .feedback?.isCorrect,
    ).toBe(true);
  });
  it("keeps a first matching error after a correct deferred MCQ", () => {
    const { questions } = build(4, ["matching"]),
      q = questions[0];
    let s = session(questions);
    const send = (
      kind: "answer" | "defer",
      optionId?: string,
      variant: "primary" | "choice" = "primary",
    ) => {
      s = applyPracticeCommand(s, q, {
        kind,
        eventId: randomUUID(),
        revision: s.revision,
        ordinal: q.ordinal,
        optionId,
        variant,
      });
    };
    send("answer", q.options.find((o) => o.id !== q.correctOptionId)!.id);
    send("defer");
    send("answer", q.choiceSnapshot!.correctOptionId, "choice");
    expect(practiceSummary(s, questions)).toMatchObject({
      correct: 0,
      wrong: 1,
      repeatCorrect: 1,
    });
    expect(
      publicPracticeQuestion(q, { ...s, status: "submitted" }, questions)
        .feedback?.isCorrect,
    ).toBe(false);
  });
  it("does not splice a deferred word into an intact matching board", () => {
    const { questions } = build(12, ["matching"]),
      q = questions[0];
    const s = applyPracticeCommand(session(questions), q, {
      kind: "defer",
      eventId: "00000000-0000-4000-8000-000000000001",
      revision: 0,
      ordinal: q.ordinal,
    });
    const queue = s.learningQueue!,
      idx = queue.indexOf(q.ordinal);
    if (idx < queue.length - 1)
      expect(s.activityByOrdinal![queue[idx - 1]]).not.toBe(
        s.activityByOrdinal![queue[idx + 1]],
      );
  });
  it("normalizes tone notation and excludes polyphonic prompts and homophone distractors", () => {
    expect(hearingKey("Bai2")).toBe(hearingKey("bái"));
    const altered = lex.map((v) => ({ ...v }));
    altered[0].pinyin = "bái";
    altered[1].pinyin = "Bai2";
    const b = buildExerciseQuestions(
      altered,
      [lex[0].id],
      "mixed",
      "seed",
      randomUUID,
      ["listening_choice"],
    );
    expect(b.questions[0].options.some((o) => o.label === lex[1].word)).toBe(
      false,
    );
    altered[1].word = altered[0].word;
    altered[1].pinyin = "hēi";
    expect(() =>
      buildExerciseQuestions(
        altered,
        [lex[0].id],
        "mixed",
        "seed",
        randomUUID,
        ["listening_choice"],
      ),
    ).toThrow();
  });
  it("rejects new exercise types in exams and leaves legacy sessions unchanged", () => {
    const input = {
      requestId: randomUUID(),
      source: { kind: "band", band: "1" },
      mode: "exam",
      direction: "mixed",
      language: "en",
      lessonSize: 20,
      exerciseTypes: ["matching"],
    };
    expect(practiceStartSchema.safeParse(input).success).toBe(false);
    expect(
      practiceStartSchema.safeParse({ ...input, exerciseTypes: undefined })
        .success,
    ).toBe(true);
  });
});
