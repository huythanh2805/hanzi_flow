import { readingKey } from "./word-enrichment";
import {
  buildPracticeQuestions,
  meaningAliases,
  practiceRank,
  type ExerciseType,
  type PracticeLexeme,
  type PrivatePracticeQuestion,
  type PrivatePracticeSession,
  type PracticeStart,
} from "./practice";

export const exerciseLabels: Record<ExerciseType, string> = {
  meaning_choice: "Chữ ↔ nghĩa",
  listening_choice: "Nghe chọn chữ",
  matching: "Ghép cặp",
};
export function hearingKey(pinyin: string) {
  return readingKey(pinyin).toLocaleLowerCase();
}
export function normalizedExerciseTypes(types?: ExerciseType[]) {
  return (
    ["meaning_choice", "listening_choice", "matching"] as ExerciseType[]
  ).filter((t) => (types ?? ["meaning_choice"]).includes(t));
}
type Board = PrivatePracticeQuestion[];
export function upgradePracticeQuestions(
  questions: PrivatePracticeQuestion[],
  lexicon: PracticeLexeme[],
  requested: ExerciseType[],
  uuid: () => string,
) {
  const types = normalizedExerciseTypes(requested);
  if (!types.length) throw new Error("Hãy chọn ít nhất một loại bài.");
  const byId = new Map(lexicon.map((v) => [v.id, v]));
  const readings = new Map<string, Set<string>>();
  for (const v of lexicon) {
    if (!readings.has(v.word)) readings.set(v.word, new Set());
    readings.get(v.word)!.add(hearingKey(v.pinyin));
  }
  const pools = new Map<string, PracticeLexeme[]>();
  const sameCounts = new Map<string, number>();
  for (const v of lexicon)
    sameCounts.set(v.band, (sameCounts.get(v.band) ?? 0) + 1);
  for (const v of lexicon)
    if (!pools.has(v.band))
      pools.set(
        v.band,
        lexicon
          .filter((c) => practiceRank(c.band) <= practiceRank(v.band))
          .sort(
            (a, b) =>
              Number(b.band === v.band) - Number(a.band === v.band) ||
              a.id.localeCompare(b.id),
          ),
      );
  const counts: Record<ExerciseType, number> = {
    meaning_choice: 0,
    listening_choice: 0,
    matching: 0,
  };
  const listening = (q: PrivatePracticeQuestion) => {
    const target = byId.get(q.vocabularyId)!;
    if (!hearingKey(target.pinyin) || readings.get(target.word)!.size !== 1)
      return null;
    const chosen = [target],
      words = new Set([target.word]),
      sounds = new Set([hearingKey(target.pinyin)]);
    const pool = pools.get(target.band)!,
      sameCount = sameCounts.get(target.band)!;
    const offset =
      parseInt(q.correctOptionId.replaceAll("-", "").slice(0, 8), 16) %
      sameCount;
    for (let n = 0; n < pool.length; n++) {
      const c = pool[n < sameCount ? (n + offset) % sameCount : n];
      if (chosen.length === 4) break;
      if (
        !hearingKey(c.pinyin) ||
        readings.get(c.word)!.size !== 1 ||
        words.has(c.word) ||
        sounds.has(hearingKey(c.pinyin))
      )
        continue;
      chosen.push(c);
      words.add(c.word);
      sounds.add(hearingKey(c.pinyin));
    }
    if (chosen.length !== 4) return null;
    // Stable order independent of the private primary answer IDs.
    const sorted = chosen.sort((a, b) => a.id.localeCompare(b.id));
    const keyed = sorted
      .map((v) => ({ vocabularyId: v.id, id: uuid(), label: v.word }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const options = keyed.map(({ id, label }) => ({ id, label }));
    return {
      options,
      correctOptionId: keyed.find((v) => v.vocabularyId === target.id)!.id,
    };
  };
  const ordered = [...questions].sort((a, b) =>
    a.vocabularyId.localeCompare(b.vocabularyId),
  );
  for (const q of ordered) {
    q.choiceSnapshot = {
      prompt: q.prompt,
      promptPinyin: q.promptPinyin,
      direction: q.direction,
      options: q.options,
      correctOptionId: q.correctOptionId,
    };
    let assigned = false;
    for (const type of [...types].sort(
      (a, b) => counts[a] - counts[b] || types.indexOf(a) - types.indexOf(b),
    )) {
      if (type === "listening_choice") {
        const audio = listening(q);
        if (!audio) continue;
        Object.assign(q, audio, {
          prompt: "",
          promptPinyin: undefined,
          audioText: q.feedback.word,
          direction: "word-meaning",
        });
      }
      q.exerciseType = type;
      counts[type]++;
      assigned = true;
      break;
    }
    if (!assigned)
      throw new Error(
        `Không thể tạo dạng bài đã chọn cho ${q.vocabularyId}; từ có nhiều cách đọc hoặc thiếu đáp án nghe phân biệt.`,
      );
  }
  const compatible = (a: PrivatePracticeQuestion, b: PrivatePracticeQuestion) =>
    !(
      a.feedback.word === b.feedback.word &&
      hearingKey(a.feedback.pinyin) === hearingKey(b.feedback.pinyin)
    ) &&
    !meaningAliases(a.feedback.meaning).some((alias) =>
      meaningAliases(b.feedback.meaning).includes(alias),
    );
  const boards: Board[] = [],
    waiting = ordered.filter((q) => q.exerciseType === "matching");
  const fallback = (q: PrivatePracticeQuestion) => {
    const type = types.find(
      (t) => t !== "matching" && (t !== "listening_choice" || !!listening(q)),
    );
    if (!type)
      throw new Error(
        `Không thể ghép cặp đầy đủ: ${q.vocabularyId}. Cần ít nhất hai từ có chữ và nghĩa phân biệt.`,
      );
    counts.matching--;
    counts[type]++;
    q.exerciseType = type;
    if (type === "listening_choice")
      Object.assign(q, listening(q)!, {
        prompt: "",
        promptPinyin: undefined,
        audioText: q.feedback.word,
        direction: "word-meaning",
      });
  };
  while (waiting.length) {
    const board = [waiting.shift()!];
    for (let i = 0; i < waiting.length && board.length < 4;) {
      if (board.every((q) => compatible(q, waiting[i])))
        board.push(waiting.splice(i, 1)[0]);
      else i++;
    }
    if (board.length === 1) {
      const donor = boards.find(
        (b) => b.length >= 3 && b.some((q) => compatible(q, board[0])),
      );
      if (donor)
        board.push(
          donor.splice(
            donor.findIndex((q) => compatible(q, board[0])),
            1,
          )[0],
        );
      else {
        fallback(board[0]);
        continue;
      }
    }
    boards.push(board);
  }
  for (const board of boards) {
    const id = uuid();
    const options = [...board]
      .sort((a, b) => b.vocabularyId.localeCompare(a.vocabularyId))
      .map((q) => ({
        id: uuid(),
        label: q.feedback.meaning,
        vocabularyId: q.vocabularyId,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const q of board) {
      const index = options.findIndex((o) => o.vocabularyId === q.vocabularyId);
      Object.assign(q, {
        boardId: id,
        boardOrdinals: board.map((v) => v.ordinal),
        prompt: q.feedback.word,
        promptPinyin: q.feedback.pinyin,
        direction: "word-meaning",
        options: options.map(({ id, label }) => ({ id, label })),
        correctOptionId: options[index].id,
      });
    }
  }
  return { questions, counts, boardCount: boards.length };
}
export function buildExerciseQuestions(
  lexicon: PracticeLexeme[],
  ids: string[],
  direction: PracticeStart["direction"],
  seed: string,
  uuid: () => string,
  types?: ExerciseType[],
) {
  const questions = buildPracticeQuestions(lexicon, ids, direction, seed, uuid);
  return types?.some((t) => t !== "meaning_choice")
    ? upgradePracticeQuestions(questions, lexicon, types, uuid)
    : {
        questions,
        counts: {
          meaning_choice: questions.length,
          listening_choice: 0,
          matching: 0,
        },
        boardCount: 0,
      };
}
export function exerciseSessionState(
  questions: PrivatePracticeQuestion[],
): Pick<
  PrivatePracticeSession,
  "learningQueue" | "activityByOrdinal" | "cursor"
> {
  const activityByOrdinal = Object.fromEntries(
    questions.map((q) => [q.ordinal, q.boardId ?? String(q.ordinal)]),
  );
  const seen = new Set<string>(),
    queue: number[] = [];
  for (const q of questions) {
    const activity = activityByOrdinal[q.ordinal];
    if (seen.has(activity)) continue;
    seen.add(activity);
    queue.push(...(q.boardOrdinals ?? [q.ordinal]));
  }
  return { learningQueue: queue, activityByOrdinal, cursor: queue[0] ?? 0 };
}
