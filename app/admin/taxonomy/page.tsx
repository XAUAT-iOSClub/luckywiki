import Link from "next/link";
import { FolderTree, Tags } from "lucide-react";
import { listAdminTaxonomy } from "@/lib/admin";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AdminTaxonomyPage() {
  const taxonomy = await listAdminTaxonomy();

  return (
    <div className="flex flex-col gap-6">
      <section className="surface-panel">
        <p className="eyebrow">Taxonomy</p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Manage structure and metadata</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
              Use sections and tags to keep articles discoverable, balanced, and easy
              for editors to navigate.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{taxonomy.sections.length} sections</Badge>
            <Badge variant="secondary">{taxonomy.tags.length} tags</Badge>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="size-5 text-primary" />
              Sections
            </CardTitle>
            <CardDescription>
              Group articles by their top-level path segment.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {taxonomy.sections.map((section) => (
              <div
                key={section.slug || "root"}
                className="rounded-[1.5rem] border border-border/60 bg-muted/20 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-medium">{section.label}</h2>
                      <Badge variant="secondary">
                        {section.totalArticles} articles
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {section.publishedArticles} published · {section.draftArticles} drafts ·{" "}
                      {section.totalComments} comments
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {section.sampleTitles.map((title) => (
                        <Badge key={title} variant="outline">
                          {title}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground lg:text-right">
                    <p>{section.latestUpdatedAt.toLocaleString()}</p>
                    <Link
                      href={`/admin/articles?section=${encodeURIComponent(section.slug)}`}
                      className="mt-2 inline-flex font-medium text-primary"
                    >
                      Open articles
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tags className="size-5 text-primary" />
              Tags
            </CardTitle>
            <CardDescription>
              Track the topics your editors are actually covering.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {taxonomy.tags.length === 0 ? (
              <p className="rounded-[1.5rem] border border-dashed border-border p-4 text-sm text-muted-foreground">
                No tags yet. Add them from the article editor to start organizing content.
              </p>
            ) : (
              taxonomy.tags.map((tag) => (
                <div
                  key={tag.tag}
                  className="rounded-[1.5rem] border border-border/60 bg-muted/20 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-medium">{tag.tag}</h2>
                        <Badge variant="secondary">
                          {tag.totalArticles} articles
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {tag.publishedArticles} published · {tag.draftArticles} drafts ·{" "}
                        {tag.totalComments} comments
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {tag.sampleTitles.map((title) => (
                          <Badge key={title} variant="outline">
                            {title}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground lg:text-right">
                      <p>{tag.latestUpdatedAt.toLocaleString()}</p>
                      <Link
                        href={`/admin/articles?tag=${encodeURIComponent(tag.tag)}`}
                        className="mt-2 inline-flex font-medium text-primary"
                      >
                        Filter articles
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
