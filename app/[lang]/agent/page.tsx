import type { Metadata } from "next";
import { WikiAgent } from "@/components/wiki-agent";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
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

  return buildPageMetadata(
    {
      title: dictionary.agent.title,
      description: dictionary.agent.description,
      path: localizeHref(lang, "/agent"),
    },
    lang,
  );
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

  return <WikiAgent />;
}
