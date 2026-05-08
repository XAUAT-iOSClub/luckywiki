import type { Metadata } from "next";
import { WikiAgent } from "@/components/wiki-agent";
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8 lg:px-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <WikiAgent />
    </div>
  );
}
