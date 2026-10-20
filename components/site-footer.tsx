import { getSiteSettings } from "@/lib/site";

export async function SiteFooter() {
  const settings = await getSiteSettings();
  const { footerCopyright, footerIcp } = settings;

  if (!footerCopyright && !footerIcp) {
    return null;
  }

  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-center gap-x-4 gap-y-1 px-5 py-4 text-[11.5px] text-muted-foreground sm:px-8 md:px-12">
        {footerCopyright ? <span>{footerCopyright}</span> : null}
        {footerIcp ? (
          <a
            className="transition-colors hover:text-foreground hover:underline"
            href="https://beian.miit.gov.cn"
            rel="noopener noreferrer"
            target="_blank"
          >
            {footerIcp}
          </a>
        ) : null}
      </div>
    </footer>
  );
}
