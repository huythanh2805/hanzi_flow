import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  buildPracticeQuestions,
  practiceLexicon,
  selectPracticeIds,
  practiceStartSchema,
  practiceCommandSchema,
  publicPracticeQuestion,
  applyPracticeCommand,
  practiceSummary,
  meaningAliases,
  practiceRepeatSlot,
  type PrivatePracticeSession,
  type PrivatePracticeQuestion,
} from "@/lib/domain/practice";
import { makeLessons } from "@/lib/domain/catalogue";
import type { Vocabulary } from "@/lib/domain/types";
let rows: Vocabulary[];
beforeAll(async () => {
  rows = JSON.parse(await readFile("data/catalogue.json", "utf8"));
});
describe("practice source identity", () => {
  it("selects complete Bands without the catalogue pagination cap", () => {
    expect(
      selectPracticeIds(rows, { kind: "band", band: "1" }, 20),
    ).toHaveLength(500);
    expect(
      selectPracticeIds(rows, { kind: "band", band: "7-9" }, 20),
    ).toHaveLength(5636);
  });
  it("matches existing lesson grouping and preserves nonadjacent page selections", () => {
    const bandRows = rows.filter((v) => v.band === "1"),
      lessons = makeLessons(bandRows, 20);
    expect(
      selectPracticeIds(
        rows,
        {
          kind: "groups",
          collectionType: "band",
          collectionId: "1",
          groups: [1, 13, 1],
        },
        20,
      ),
    ).toEqual([...lessons[0].entries, ...lessons[12].entries].map((v) => v.id));
    const topicRows = rows.filter((v) =>
      v.topics.includes("daily-communication"),
    );
    if (topicRows.length)
      expect(
        selectPracticeIds(
          rows,
          {
            kind: "groups",
            collectionType: "topic",
            collectionId: "daily-communication",
            groups: [1],
          },
          15,
        ),
      ).toEqual(makeLessons(topicRows, 15)[0].entries.map((v) => v.id));
  });
  it("rejects changed groups and forged retry membership", () => {
    expect(() =>
      selectPracticeIds(
        rows,
        {
          kind: "groups",
          collectionType: "band",
          collectionId: "1",
          groups: [100],
        },
        20,
      ),
    ).toThrow("Nhóm đã thay đổi");
    expect(() =>
      selectPracticeIds(
        rows,
        { kind: "retry", parentId: randomUUID(), ids: [rows[0].id] },
        20,
        {},
        [rows[1].id],
      ),
    ).toThrow();
  });
  it("does not deduplicate different readings by Chinese spelling", () => {
    const spelling = rows.find((v) =>
      rows.some(
        (other) =>
          other.id !== v.id && other.band === v.band && other.word === v.word,
      ),
    )!;
    const ids = selectPracticeIds(
      rows,
      { kind: "band", band: spelling.band as "1" },
      20,
    );
    expect(
      rows
        .filter((v) => v.band === spelling.band && v.word === spelling.word)
        .every((v) => ids.includes(v.id)),
    ).toBe(true);
  });
});
describe("practice question coverage", () => {
  it.each(["vi", "en"] as const)(
    "creates a complete Band in %s with fixed distinct choices",
    (language) => {
      const lex = practiceLexicon(rows, language),
        ids = selectPracticeIds(
          rows,
          { kind: "band", band: language === "vi" ? "1" : "7-9" },
          20,
        );
      const questions = buildPracticeQuestions(
        lex,
        ids,
        "mixed",
        "pinned-test-seed",
        randomUUID,
      );
      expect(questions).toHaveLength(language === "vi" ? 500 : 5636);
      expect(new Set(questions.map((q) => q.vocabularyId))).toEqual(
        new Set(ids),
      );
      const index = new Map(lex.map((v) => [v.id, v]));
      for (const q of questions) {
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options.map((o) => o.label)).size).toBe(4);
        expect(q.options.some((o) => o.id === q.correctOptionId)).toBe(true);
        if (q.direction === "word-meaning") {
          const target = new Set(index.get(q.vocabularyId)!.aliases);
          expect(
            q.options
              .filter((o) => o.id !== q.correctOptionId)
              .every((o) =>
                meaningAliases(o.label).every((a) => !target.has(a)),
              ),
          ).toBe(true);
        }
      }
      expect(
        questions.filter((q) => q.direction === "word-meaning"),
      ).toHaveLength(questions.length / 2);
    },
    20000,
  );
  it("blocks incomplete content instead of silently dropping selected words", () => {
    const lex = practiceLexicon(rows, "vi");
    expect(() =>
      buildPracticeQuestions(
        lex,
        selectPracticeIds(rows, { kind: "band", band: "7-9" }, 20),
        "mixed",
        "all-band-vi",
        randomUUID,
      ),
    ).toThrow("hsk30-b79-0367");
    lex[0].meaning = "";
    expect(() =>
      buildPracticeQuestions(lex, [lex[0].id], "mixed", "test", randomUUID),
    ).toThrow("thiếu nghĩa");
    expect(() =>
      buildPracticeQuestions(
        lex.slice(1, 3),
        [lex[1].id],
        "mixed",
        "test",
        randomUUID,
      ),
    ).toThrow("Không đủ đáp án");
  });
  it("keeps Vietnamese accents distinct when detecting overlapping meanings", () => {
    expect(meaningAliases("(completed action marker)")).toEqual([
      "completed action marker",
    ]);
    expect(meaningAliases("má; mẹ (cách gọi)")).toContain("má");
    expect(meaningAliases("ma")).not.toContain("má");
  });
});
describe("practice scoring boundaries", () => {
  let questions: PrivatePracticeQuestion[], session: PrivatePracticeSession;
  beforeAll(() => {
    questions = buildPracticeQuestions(
      practiceLexicon(rows, "vi"),
      rows.slice(0, 2).map((v) => v.id),
      "mixed",
      "test",
      randomUUID,
    );
    session = {
      id: randomUUID(),
      title: "Test",
      source: { kind: "entries", ids: questions.map((q) => q.vocabularyId) },
      mode: "exam",
      direction: "mixed",
      language: "vi",
      lessonSize: 20,
      total: 2,
      status: "active",
      revision: 0,
      cursor: 0,
      createdAt: new Date().toISOString(),
      submittedAt: null,
      parentId: null,
      answers: {},
      correctCount: 0,
    };
  });
  it("does not serialize exam keys or correct counts before submission", () => {
    const next = applyPracticeCommand(session, questions[0], {
      kind: "answer",
      ordinal: 0,
      optionId: questions[0].correctOptionId,
      eventId: randomUUID(),
      revision: 0,
    });
    const publicQuestion = publicPracticeQuestion(questions[0], next);
    expect(publicQuestion).not.toHaveProperty("correctOptionId");
    expect(publicQuestion).not.toHaveProperty("feedback");
    expect(publicQuestion).not.toHaveProperty("vocabularyId");
    expect(practiceSummary(next).correct).toBeNull();
    const final = applyPracticeCommand(next, undefined, {
      kind: "submit",
      eventId: randomUUID(),
      revision: 1,
    });
    expect(practiceSummary(final)).toMatchObject({
      correct: 1,
      wrong: 0,
      unanswered: 1,
    });
    expect(
      publicPracticeQuestion(questions[0], final).feedback?.isCorrect,
    ).toBe(true);
  });
  it("allows exam changes but freezes a learning answer and enforces revisions", () => {
    const learned = applyPracticeCommand(
      { ...session, mode: "learn" },
      questions[0],
      {
        kind: "answer",
        ordinal: 0,
        optionId: questions[0].correctOptionId,
        eventId: randomUUID(),
        revision: 0,
      },
    );
    expect(() =>
      applyPracticeCommand(learned, questions[0], {
        kind: "answer",
        ordinal: 0,
        optionId: questions[0].options[0].id,
        eventId: randomUUID(),
        revision: 1,
      }),
    ).toThrow("Câu đã chấm");
    expect(() =>
      applyPracticeCommand(learned, questions[1], {
        kind: "mark",
        ordinal: 1,
        marked: true,
        eventId: randomUUID(),
        revision: 0,
      }),
    ).toThrow("STALE_REVISION");
  });
  it("defers unanswered learning words without grading or duplicating them, then returns to them", () => {
    let s: PrivatePracticeSession = { ...session, mode: "learn" };
    const defer = (ordinal: number) => {
      s = applyPracticeCommand(s, questions[ordinal], {
        kind: "defer",
        ordinal,
        eventId: randomUUID(),
        revision: s.revision,
      });
    };
    defer(0);
    expect(s.cursor).toBe(1);
    expect(practiceSummary(s)).toMatchObject({
      answered: 0,
      correct: 0,
      deferredCount: 1,
      total: 2,
    });
    expect(publicPracticeQuestion(questions[0], s)).toMatchObject({
      deferred: true,
      marked: true,
      selectedOptionId: null,
    });
    expect(publicPracticeQuestion(questions[0], s).feedback).toBeUndefined();
    defer(1);
    defer(0);
    expect(s.deferredOrdinals).toEqual([1, 0]);
    expect(s.cursor).toBe(1);
    s = applyPracticeCommand(s, questions[1], {
      kind: "answer",
      ordinal: 1,
      optionId: questions[1].correctOptionId,
      eventId: randomUUID(),
      revision: s.revision,
    });
    expect(s.cursor).toBe(0);
    expect(() => defer(0)).toThrow("từ cuối cùng");
    s = applyPracticeCommand(s, questions[0], {
      kind: "answer",
      ordinal: 0,
      optionId: questions[0].correctOptionId,
      eventId: randomUUID(),
      revision: s.revision,
    });
    expect(practiceSummary(s)).toMatchObject({
      total: 2,
      answered: 2,
      correct: 2,
      deferredCount: 0,
    });
    expect(() =>
      applyPracticeCommand(session, questions[0], {
        kind: "defer",
        ordinal: 0,
        eventId: randomUUID(),
        revision: 0,
      }),
    ).toThrow("Luyện học");
  });
  it("can insert at every future position, including beyond three questions and the tail", () => {
    const positions = Array.from({ length: 20 }, (_, seed) =>
      practiceRepeatSlot(
        `30000000-0000-4000-8000-${seed.toString(16).padStart(12, "0")}`,
        20,
      ),
    );
    expect(positions).toEqual(Array.from({ length: 20 }, (_, n) => n + 1));
    expect(practiceRepeatSlot("30000000-0000-4000-8000-ffffffffffff", 20)).toBe(
      16,
    );
    expect(practiceRepeatSlot(randomUUID(), 0)).toBe(0);
    expect(practiceRepeatSlot(randomUUID(), 1)).toBe(1);
  });
  it("interleaves a wrong word and grades its repeat separately", () => {
    const qs = buildPracticeQuestions(
      practiceLexicon(rows, "en"),
      rows.slice(0, 6).map((v) => v.id),
      "mixed",
      "repeat",
      randomUUID,
    );
    let s: PrivatePracticeSession = { ...session, mode: "learn", total: 6 };
    const send = (
      ordinal: number,
      kind: "answer" | "defer",
      optionId?: string,
    ) => {
      s = applyPracticeCommand(s, qs[ordinal], {
        kind,
        ordinal,
        optionId,
        eventId: "30000000-0000-4000-8000-000000000001",
        revision: s.revision,
      });
    };
    const wrong = qs[0].options.find((o) => o.id !== qs[0].correctOptionId)!.id;
    send(0, "answer", wrong);
    send(0, "defer");
    expect(s.learningQueue).toEqual([1, 2, 0, 3, 4, 5]);
    expect(practiceSummary(s)).toMatchObject({
      total: 6,
      answered: 1,
      correct: 0,
      wrong: 1,
      pendingCount: 6,
    });
    expect(publicPracticeQuestion(qs[0], s)).toMatchObject({
      selectedOptionId: null,
      deferred: true,
    });
    expect(publicPracticeQuestion(qs[0], s).feedback).toBeUndefined();
    send(1, "answer", qs[1].correctOptionId);
    send(2, "answer", qs[2].correctOptionId);
    expect(s.cursor).toBe(0);
    send(0, "answer", qs[0].correctOptionId);
    expect(s.answers[0].optionId).toBe(wrong);
    expect(publicPracticeQuestion(qs[0], s).feedback?.isCorrect).toBe(true);
    expect(practiceSummary(s)).toMatchObject({
      answered: 3,
      correct: 2,
      wrong: 1,
      repeatAnswered: 1,
      repeatCorrect: 1,
      pendingCount: 3,
    });
    const final = applyPracticeCommand(s, undefined, {
      kind: "submit",
      eventId: randomUUID(),
      revision: s.revision,
    });
    expect(publicPracticeQuestion(qs[0], final).feedback?.isCorrect).toBe(
      false,
    );
    expect(publicPracticeQuestion(qs[0], final).selectedOptionId).toBe(wrong);
  });
  it("can ask a wrong final word again without overwriting its first answer", () => {
    let s: PrivatePracticeSession = { ...session, mode: "learn", total: 1 };
    const wrong = questions[0].options.find(
      (o) => o.id !== questions[0].correctOptionId,
    )!.id;
    s = applyPracticeCommand(s, questions[0], {
      kind: "answer",
      ordinal: 0,
      optionId: wrong,
      eventId: randomUUID(),
      revision: 0,
    });
    s = applyPracticeCommand(s, questions[0], {
      kind: "defer",
      ordinal: 0,
      eventId: randomUUID(),
      revision: 1,
    });
    expect(s.learningQueue).toEqual([0]);
    s = applyPracticeCommand(s, questions[0], {
      kind: "answer",
      ordinal: 0,
      optionId: questions[0].correctOptionId,
      eventId: randomUUID(),
      revision: 2,
    });
    expect(practiceSummary(s)).toMatchObject({
      total: 1,
      correct: 0,
      wrong: 1,
      repeatCorrect: 1,
      repeatAnswered: 1,
      pendingCount: 0,
    });
    expect(() =>
      applyPracticeCommand(s, questions[0], {
        kind: "answer",
        ordinal: 0,
        optionId: wrong,
        eventId: randomUUID(),
        revision: 3,
      }),
    ).toThrow("Câu đã chấm");
  });
  it("rejects caller-provided correctness and invalid session settings", () => {
    expect(
      practiceCommandSchema.safeParse({
        kind: "answer",
        eventId: randomUUID(),
        revision: 0,
        ordinal: 0,
        optionId: randomUUID(),
        correct: true,
      }).success,
    ).toBe(false);
    expect(
      practiceStartSchema.safeParse({
        requestId: randomUUID(),
        source: { kind: "band", band: "9" },
        mode: "exam",
        direction: "mixed",
        language: "vi",
        lessonSize: 20,
      }).success,
    ).toBe(false);
  });
});
