# Design system

Primary references: `01-welcome.png` through `16-settings.png` from the supplied local HanziFlow-UI-Images directory. These images are not shipped as UI screenshots or background substitutes.

Jade primary and ink colors, cool off-white canvas, white cards, thin neutral borders, restrained shadows, 12–20px radii. Dark mode uses deep teal surfaces and brighter jade. Tokens live in CSS variables and Tailwind theme mappings. Typography: system UI with local Chinese serif fallbacks for study glyphs; avoid font network dependency. Vietnamese copy, Chinese language attributes, clear pinyin and explicit missing-definition labels.

Desktop: persistent left navigation, quiet top bar, generous content max-width. Mobile: toggleable navigation with backdrop, stacked cards, horizontally scrollable tables, no clipped controls. Visible focus rings, labelled inputs, semantic buttons, status announcements, reduced-motion support, adequate contrast. Study cards flip only on an explicit button, keyboard shortcuts ignore text input fields.

Phase 1 pages: welcome/auth, dashboard, vocabulary library/detail, HSK discovery/detail, topics discovery/detail, basic flashcards, account settings. Phase 2/3 destinations are clearly marked as planned and are not rendered as fake working pages or fake statistics.
