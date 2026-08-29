import Link from "next/link";
import { FolderTree, Tags } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAdminTaxonomy } from "@/lib/admin";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { notFound } from "next/navigation";
import { requireRootSession } from "@/lib/auth/session";

type Params = Promise<{ lang: string }>;

export default async function AdminTaxonomyPage({
  params,
}: {
  params: Params;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  await requireRootSession(lang, localizeHref(lang, "/admin/articles"));

  const [taxonomy, dictionary] = await Promise.all([
    listAdminTaxonomy(),
    getDictionary(lang),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 md:pt-6">
      <section className="surface-panel">
        <p className="eyebrow">{dictionary.admin.taxonomyEyebrow}</p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{dictionary.admin.taxonomyTitle}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
              {dictionary.admin.taxonomyDescription}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">
              {formatNumber(lang, taxonomy.sections.length)} {dictionary.common.sections.toLowerCase()}
            </Badge>
            <Badge variant="secondary">
              {formatNumber(lang, taxonomy.tags.length)} {dictionary.common.tags.toLowerCase()}
            </Badge>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="admin-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="size-5 text-primary" />
              {dictionary.admin.sections}
            </CardTitle>
            <CardDescription>{dictionary.admin.groupArticlesBy}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">{dictionary.common.section}</TableHead>
                  <TableHead className="text-center">{dictionary.common.articles}</TableHead>
                  <TableHead className="pr-6 text-right">{dictionary.common.action}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxonomy.sections.map((section) => (
                  <TableRow key={section.slug || "root"}>
                    <TableCell className="pl-6 py-4">
                      <div className="space-y-1">
                        <p className="font-medium">{section.slug ? section.label : dictionary.common.root}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {section.slug ? `/${section.slug}` : "/"}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {section.sampleTitles.slice(0, 3).map((title) => (
                            <Badge key={title} variant="outline" className="text-[10px] px-1 py-0 h-4 truncate max-w-[120px]">
                              {title}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="space-y-1">
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                          {formatNumber(lang, section.totalArticles)}
                        </Badge>
                        <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {section.publishedArticles}P · {section.draftArticles}D
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground">
                          {formatDateTime(lang, section.latestUpdatedAt)}
                        </p>
                        <Link
                          href={localizeHref(lang, `/admin/articles?section=${encodeURIComponent(section.slug)}`)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {dictionary.admin.openArticles}
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="admin-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tags className="size-5 text-primary" />
              {dictionary.admin.tagsTitle}
            </CardTitle>
            <CardDescription>{dictionary.admin.trackTopics}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {taxonomy.tags.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {dictionary.admin.noTagsYet}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">{dictionary.common.tag}</TableHead>
                    <TableHead className="text-center">{dictionary.common.articles}</TableHead>
                    <TableHead className="pr-6 text-right">{dictionary.common.action}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxonomy.tags.map((tag) => (
                    <TableRow key={tag.tag}>
                      <TableCell className="pl-6 py-4">
                        <div className="space-y-1">
                          <p className="font-medium">#{tag.tag}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {tag.sampleTitles.slice(0, 3).map((title) => (
                              <Badge key={title} variant="outline" className="text-[10px] px-1 py-0 h-4 truncate max-w-[120px]">
                                {title}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="space-y-1">
                          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                            {formatNumber(lang, tag.totalArticles)}
                          </Badge>
                          <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {tag.publishedArticles}P · {tag.draftArticles}D
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <div className="space-y-1">
                          <p className="text-[10px] text-muted-foreground">
                            {formatDateTime(lang, tag.latestUpdatedAt)}
                          </p>
                          <Link
                            href={localizeHref(lang, `/admin/articles?tag=${encodeURIComponent(tag.tag)}`)}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            {dictionary.admin.filterArticlesAction}
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
