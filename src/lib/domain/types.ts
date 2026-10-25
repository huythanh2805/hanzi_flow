export const bands = ["1", "2", "3", "4", "5", "6", "7-9"] as const;
export type Band = (typeof bands)[number];
export type LearningState = "NEW" | "LEARNING" | "MASTERED";
export type Progress = {
  vocabulary_id: string;
  state: LearningState;
  favorite: boolean;
  difficult: boolean;
  suspended: boolean;
  studied_at: string | null;
  updated_at: string;
};
export type ProgressMap = Record<string, Progress>;
export type Topic = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
};
export type Sense = {
  id: string;
  part_of_speech?: string;
  vi?: string;
  en?: string;
  source_id: string;
  source_url?: string;
  attribution?: { label: string; license: string; url: string }[];
  match_method?: string;
  translation_meta?: Partial<
    Record<
      "vi" | "en",
      {
        provider: string;
        model: string;
        source_language: string;
        source_text: string;
        review_status: "machine-unreviewed";
      }
    >
  >;
};
export type Example = {
  id: string;
  chinese: string;
  pinyin?: string;
  vi?: string;
  en?: string;
  source_id: string;
  source_url?: string;
  attribution?: { label: string; license: string; url: string }[];
  original_chinese?: string;
  level_check?: import("./word-enrichment").LevelCheck;
  translation_meta?: Sense["translation_meta"];
};
export type Vocabulary = {
  id: string;
  band: Band;
  word: string;
  pinyin: string;
  official_entry: string;
  official_pinyin: string;
  source_order: number;
  source_id: string;
  senses: Sense[];
  examples: Example[];
  topics: string[];
  audio_url?: string;
};
export type Filters = {
  query: string;
  band: string;
  topic: string;
  state: string;
  favorite: boolean;
  difficult: boolean;
  sort: "order" | "band" | "progress";
  page: number;
  pageSize: number;
};
export type PageResult = {
  items: Vocabulary[];
  total: number;
  page: number;
  pageSize: number;
};
export type Preferences = {
  dailyGoal: number;
  lessonSize: 10 | 15 | 20 | 25 | 30;
  preferredBand: string;
  preferredTopics: string[];
  language: "vi" | "en";
  showPinyin: boolean;
  autoPlay: boolean;
  speechRate: number;
  theme: "light" | "dark" | "system";
  timeZone: string;
};
export const defaultPreferences: Preferences = {
  dailyGoal: 20,
  lessonSize: 20,
  preferredBand: "1",
  preferredTopics: [],
  language: "vi",
  showPinyin: true,
  autoPlay: false,
  speechRate: 0.85,
  theme: "system",
  timeZone: "Asia/Bangkok",
};
export type Bootstrap = {
  mode: "trial" | "cloud";
  user: { id: string; email: string; name: string } | null;
  progress: ProgressMap;
  preferences: Preferences;
  topics: Topic[];
  counts: Record<string, number>;
  topicCounts: Record<string, number>;
  topicEntryIds: Record<string, string[]>;
  total: number;
  uniqueSpellings: number;
  featured: Vocabulary[];
};
export type ProgressPatch = {
  state?: "LEARNING";
  favorite?: boolean;
  difficult?: boolean;
  suspended?: boolean;
};
