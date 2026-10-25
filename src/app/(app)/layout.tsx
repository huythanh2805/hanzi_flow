import { getBootstrap } from "@/lib/server/catalogue";
import { LearningProvider } from "@/components/provider";
import { AppShell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const bootstrap = await getBootstrap();
  return (
    <LearningProvider bootstrap={bootstrap}>
      <AppShell>{children}</AppShell>
    </LearningProvider>
  );
}
