// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LearningProvider } from "@/components/provider";
import { Flashcards } from "@/components/flashcards";
import {
  defaultPreferences,
  type Bootstrap,
  type Vocabulary,
} from "@/lib/domain/types";
vi.mock("@/app/actions", () => ({
  updateVocabulary: vi.fn(),
  savePreferences: vi.fn(),
}));
const word: Vocabulary = {
  id: "hsk30-b1-0124",
  band: "1",
  word: "工作",
  pinyin: "gōngzuò",
  official_entry: "工作",
  official_pinyin: "gōngzuò",
  source_id: "fixture",
  source_order: 124,
  senses: [],
  examples: [],
  topics: [],
};
const bootstrap: Bootstrap = {
  mode: "trial",
  user: null,
  progress: {},
  preferences: defaultPreferences,
  topics: [],
  counts: { "1": 1 },
  topicCounts: {},
  topicEntryIds: {},
  total: 1,
  uniqueSpellings: 1,
  featured: [],
};
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});
afterEach(cleanup);
it("reveals with the keyboard and persists actual study without fake mastery", async () => {
  render(
    <LearningProvider bootstrap={bootstrap}>
      <Flashcards initial={[word]} singleEntry />
    </LearningProvider>,
  );
  expect(screen.queryByText("gōngzuò")).toBeNull();
  fireEvent.keyDown(window, { code: "Space", key: " " });
  expect(screen.getByText("gōngzuò")).toBeTruthy();
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: /Đã học · Tiếp tục/ })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: /Đã học · Tiếp tục/ }));
  await screen.findByText("Bạn đã hoàn thành buổi học.");
  const saved = JSON.parse(localStorage.getItem("hanziflow.trial.v1")!);
  expect(saved.progress[word.id].state).toBe("LEARNING");
  expect(saved.progress[word.id].studied_at).toBeTruthy();
});
it("does not reveal cards when a keyboard event comes from an input", () => {
  render(
    <LearningProvider bootstrap={bootstrap}>
      <Flashcards initial={[word]} singleEntry />
    </LearningProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Tùy chỉnh buổi học" }));
  const checkbox = screen.getByLabelText("Chỉ từ đã lưu");
  fireEvent.keyDown(checkbox, { code: "Space", key: " " });
  expect(screen.queryByText("gōngzuò")).toBeNull();
});
