import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
          <CardDescription>
            {dictionary.siteSettings.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-5 text-sm leading-7 text-muted-foreground">
            Site settings are now managed through environment variables. Update the deployment
            environment, then restart or redeploy the app for changes to take effect.
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SettingRow
              label={dictionary.siteSettings.siteName}
              envKey="SITE_NAME"
              value={settings.siteName}
            />
            <SettingRow
              label={dictionary.siteSettings.siteDescription}
              envKey="SITE_DESCRIPTION"
              value={settings.description}
            />
            <SettingRow
              label={dictionary.siteSettings.logoUrl}
              envKey="SITE_LOGO_URL"
              value={settings.logoUrl}
            />
            <SettingRow
              label={dictionary.siteSettings.faviconUrl}
              envKey="SITE_FAVICON_URL"
              value={settings.faviconUrl}
            />
            <SettingRow
              label={dictionary.siteSettings.footerCopyright}
              envKey="SITE_FOOTER_COPYRIGHT"
              value={settings.footerCopyright}
            />
            <SettingRow
              label={dictionary.siteSettings.footerIcp}
              envKey="SITE_FOOTER_ICP"
              value={settings.footerIcp}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingRow({
  label,
  envKey,
  value,
}: {
  label: string;
  envKey: string;
  value: string | null;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/70 p-5">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{envKey}</p>
      <p className="mt-3 text-sm break-words">{value || "Not set"}</p>
    </div>
  );
}
