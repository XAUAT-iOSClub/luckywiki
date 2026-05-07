import { notFound, redirect } from "next/navigation";
import { hasLocale, localizeHref } from "@/lib/i18n/config";

type Params = Promise<{ lang: string }>;

export default async function LocalizedHomePage({
  params,
}: {
  params: Params;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  redirect(localizeHref(lang, "/wiki"));
}
