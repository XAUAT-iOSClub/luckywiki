import { getSiteSettings } from "@/lib/site";

export async function SiteFooter() {
  const settings = await getSiteSettings();
  const { footerCopyright, footerIcp } = settings;

  if (!footerCopyright && !footerIcp) {
    return null;
  }

  return (
    <footer className="border-t bg-card/50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-4 text-xs text-muted-foreground">
        {footerCopyright ? <span>{footerCopyright}</span> : null}
        {footerIcp ? (
          <a
            href="https://beian.miit.gov.cn"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {footerIcp}
          </a>
        ) : null}
      </div>
    </footer>
  );
}
