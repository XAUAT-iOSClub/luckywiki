import { readFile } from "node:fs/promises";
import { notFound } from "next/navigation";
import matter from "gray-matter";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Page, PageHeader } from "@/components/ui/page-ui";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale } from "@/lib/i18n/config";

type Params = Promise<{ lang: string }>;

export default async function DesignMarkdownPage({ params }: { params: Params }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const [raw, dictionary] = await Promise.all([
    readFile(`${process.cwd()}/markdown-syntax-showcase.mdx`, "utf8"),
    getDictionary(lang),
  ]);
  const { content } = matter(raw);

  return (
    <Page className="max-w-[1180px]">
      <PageHeader
        description="用于检查 macOS 15 / shadcn 风格下的 Markdown 排版、代码块、提示块、表格与自定义组件。"
        descriptionClassName="text-[13.5px] leading-6"
        title="Markdown 渲染预览"
        titleClassName="text-[28px] sm:text-[30px]"
      />
      <div className="max-w-3xl">
        <MarkdownRenderer
          linkToSectionLabel={dictionary.common.linkToSection}
          markdown={content}
        />
      </div>
    </Page>
  );
}
