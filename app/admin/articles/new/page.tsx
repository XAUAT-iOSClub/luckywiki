import { createArticleAction } from "@/app/actions/admin";
import { ArticleEditor } from "@/components/article-editor";

export default function NewArticlePage() {
  return (
    <section className="surface-panel space-y-6">
      <div>
        <p className="eyebrow">New Article</p>
        <h2 className="text-2xl font-semibold">Create a draft or publish immediately</h2>
      </div>
      <ArticleEditor
        action={createArticleAction}
        initialState={{}}
        submitLabel="Create article"
      />
    </section>
  );
}
