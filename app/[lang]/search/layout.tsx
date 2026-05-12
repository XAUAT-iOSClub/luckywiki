import { WikiShell } from "@/components/wiki-shell";

export default async function SearchLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: React.ReactNode;
}) {
  const { lang } = await params;

  return (
    <WikiShell lang={lang} section="search">
      {children}
    </WikiShell>
  );
}
