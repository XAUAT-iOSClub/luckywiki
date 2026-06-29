import { WikiShell } from "@/components/wiki-shell";

export const dynamic = "force-dynamic";

type Params = Promise<{ lang: string }>;

export default async function AgentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  const { lang } = await params;
  return <WikiShell lang={lang} section="agent">{children}</WikiShell>;
}
