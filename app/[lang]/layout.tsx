import type { Metadata } from "next";
import { Suspense, type CSSProperties } from "react";
import { notFound } from "next/navigation";
import "../globals.css";
import { TopRouteProgress } from "@/components/top-route-progress";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import {
  getIntlLocale,
  hasLocale,
  type Locale,
  locales,
} from "@/lib/i18n/config";
import { I18nProvider } from "@/lib/i18n/provider";
import { SearchProvider } from "@/components/search-provider";
import { WikiSearchDialog } from "@/components/wiki-search-dialog";
import { getMetadataBase, getSiteSettings } from "@/lib/site";
import { WebSiteJsonLd } from "@/lib/structured-data";
import { Analytics } from "@vercel/analytics/next"

const fontVariables = {
  "--font-sans":
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  "--font-geist-mono":
    '"SFMono-Regular", ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
} as CSSProperties;

type LayoutParams = Promise<{ lang: string }>;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: LayoutParams;
}): Promise<Metadata> {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const [dictionary, siteSettings] = await Promise.all([
    getDictionary(lang),
    getSiteSettings(),
  ]);

  return {
    metadataBase: getMetadataBase(),
    title: {
      default: siteSettings.siteName,
      template: `%s | ${siteSettings.siteName}`,
    },
    description: siteSettings.description || dictionary.metadata.description,
    generator: "Next.js",
    creator: siteSettings.siteName,
    robots: {
      index: true,
      follow: true,
    },
    icons: {
      icon: "/favicon.ico",
    },
  };
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: LayoutParams;
}>) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const locale: Locale = lang;
  const dictionary = await getDictionary(locale);

  return (
    <html
      lang={getIntlLocale(locale)}
      className={cn("h-full", "antialiased", "font-sans")}
      style={fontVariables}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <TopRouteProgress />
        </Suspense>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider dictionary={dictionary} locale={locale}>
            <SearchProvider>
              <TooltipProvider>{children}</TooltipProvider>
              <WikiSearchDialog />
            </SearchProvider>
          </I18nProvider>
          <WebSiteJsonLd locale={locale} />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
