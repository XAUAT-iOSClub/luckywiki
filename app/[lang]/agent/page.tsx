import type { Metadata } from "next";
import { Bot, Sparkles } from "lucide-react";
import { WikiAgent } from "@/components/wiki-agent";
import { Badge } from "@/components/ui/badge";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale } from "@/lib/i18n/config";
import { notFound } from "next/navigation";

type Params = Promise<{ lang: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const dictionary = await getDictionary(lang);

  return {
    title: dictionary.agent.title,
    description: dictionary.agent.description,
  };
}

export default async function AgentPage({
  params,
}: {
  params: Params;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const dictionary = await getDictionary(lang);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8 lg:px-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="space-y-8">
        <header className="surface-panel !rounded-[2.5rem] !p-8 md:!p-10 border-border/40 shadow-xl shadow-black/5 dark:shadow-black/20">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="space-y-4 max-w-3xl">
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-widest font-bold bg-primary/10 text-primary border-none">
                {dictionary.agent.badge}
              </Badge>
              <div className="space-y-3">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance">
                  {dictionary.agent.title}
                </h1>
                <p className="text-base md:text-lg leading-relaxed text-muted-foreground">
                  {dictionary.agent.description}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.75rem] border border-border/50 bg-background/70 p-4">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Bot className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold">{dictionary.agent.basedOnWiki}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dictionary.agent.basedOnWikiHint}
                </p>
              </div>
              <div className="rounded-[1.75rem] border border-border/50 bg-background/70 p-4">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold">{dictionary.agent.withSources}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dictionary.agent.withSourcesHint}
                </p>
              </div>
            </div>
          </div>
        </header>

        <WikiAgent />
      </div>
    </div>
  );
}
