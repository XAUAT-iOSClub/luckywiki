import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
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

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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

  const dictionary = await getDictionary(lang);

  return {
    title: {
      default: dictionary.metadata.title,
      template: `%s | ${dictionary.metadata.title}`,
    },
    description: dictionary.metadata.description,
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
      className={cn("h-full", "antialiased", geistMono.variable, "font-sans", geist.variable)}
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
            <TooltipProvider>{children}</TooltipProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
