import type { Metadata } from "next";
import "./globals.css";
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
    <html lang="vi" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
