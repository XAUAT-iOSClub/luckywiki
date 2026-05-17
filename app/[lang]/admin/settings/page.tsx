import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteSettingsForm } from "@/components/site-settings-form";
import { updateSiteSettingsAction } from "@/app/actions/site-settings";
import { getSiteSettings } from "@/lib/site";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { requireRootSession } from "@/lib/auth/session";

type Params = Promise<{ lang: string }>;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Site Settings - Admin",
    robots: { index: false, follow: false },
  };
}

export default async function AdminSiteSettingsPage({
  params,
}: {
  params: Params;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  await requireRootSession(lang, localizeHref(lang, "/admin/articles"));

  const [settings, dictionary] = await Promise.all([
    getSiteSettings(),
    getDictionary(lang),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <section className="surface-panel overflow-hidden">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="eyebrow">{dictionary.common.settings}</p>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {dictionary.siteSettings.title}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {dictionary.siteSettings.description}
              </p>
            </div>
          </div>
        </div>
      </section>

      <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
        <CardHeader>
          <CardTitle>{dictionary.siteSettings.title}</CardTitle>
          <CardDescription>{dictionary.siteSettings.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <SiteSettingsForm
            action={updateSiteSettingsAction.bind(null, lang)}
            initialState={{}}
            settings={settings}
          />
        </CardContent>
      </Card>
    </div>
  );
}
