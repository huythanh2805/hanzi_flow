import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
import "./brand-theme.css";
import "./lighting.css";
import "./card-scenes.css";
import "./flashcard-surface.css";
import "./practice.css";
import "./decks.css";
import { AppAmbience, cardSceneStyle } from "@/components/app-ambience";
export const metadata: Metadata = {
  title: {
    default: "HanziFlow — Mỗi ngày một từ mới",
    template: "%s | HanziFlow",
  },
  description:
    "Học từ vựng tiếng Trung theo HSK và chủ đề. Từng bước nhỏ, tiến bộ bền vững.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="vi"
      data-theme="dark"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body style={cardSceneStyle}>
        <AppAmbience />
        {children}
      </body>
    </html>
  );
}
