import test from "node:test";
import assert from "node:assert/strict";
import {
  getRecentWikiArticles,
  getRelatedWikiArticles,
  getWikiArticleDetails,
  listWikiCategories,
  searchWikiKnowledge,
  searchWikiPaths,
} from "@/lib/agent/tools";

test("searchWikiKnowledge prefers semantic results when available", async () => {
  const result = await searchWikiKnowledge("校园卡", {
    async retrieveRelevantChunks() {
      return [
        {
          title: "校园卡",
          path: "生活/校园卡",
          heading: "补办",
          content: "校园卡丢失后可以去服务大厅补办。",
          score: 0.91,
        },
        {
          title: "校园卡",
          path: "生活/校园卡",
          heading: "充值",
          content: "校园卡可以线上充值。",
          score: 0.7,
        },
      ];
    },
    async findSuggestedSources() {
      return [];
    },
    async findArticleByPath() {
      return null;
    },
    async findArticlesByPath() {
      return [];
    },
    async listRecentArticles() {
      return [];
    },
    async listAllPublishedArticles() {
      return [];
    },
    async listRelatedArticles() {
      return [];
    },
  });

  assert.equal(result.mode, "semantic");
  assert.equal(result.sources.length, 1);
  assert.match(result.chunks[0]?.content ?? "", /服务大厅/);
});

test("getWikiArticleDetails returns chunk previews", async () => {
  const result = await getWikiArticleDetails("生活/校园卡", {
    async retrieveRelevantChunks() {
      return [];
    },
    async findSuggestedSources() {
      return [];
    },
    async findArticleByPath() {
      return {
        id: "article-1",
        path: "生活/校园卡",
        title: "校园卡",
        description: null,
        tags: ["生活"],
        markdown: "# 补办\n\n校园卡丢失后可以去服务大厅补办。",
        updatedAt: new Date("2026-05-11T00:00:00.000Z"),
        publishedAt: new Date("2026-05-10T00:00:00.000Z"),
      };
    },
    async findArticlesByPath() {
      return [];
    },
    async listRecentArticles() {
      return [];
    },
    async listAllPublishedArticles() {
      return [];
    },
    async listRelatedArticles() {
      return [];
    },
  });

  assert.equal(result.found, true);
  assert.equal(result.article?.path, "生活/校园卡");
  assert.match(result.article?.chunks[0]?.content ?? "", /服务大厅/);
});

test("path search, recent articles, related articles, and categories stay navigable", async () => {
  const deps = {
    async retrieveRelevantChunks() {
      return [];
    },
    async findSuggestedSources() {
      return [{ title: "校园卡", path: "生活/校园卡" }];
    },
    async findArticleByPath(path: string) {
      if (path !== "生活/校园卡") {
        return null;
      }

      return {
        id: "article-1",
        path: "生活/校园卡",
        title: "校园卡",
        description: null,
        tags: ["生活"],
        markdown: "# 补办\n\n校园卡丢失后可以去服务大厅补办。",
        updatedAt: new Date("2026-05-11T00:00:00.000Z"),
        publishedAt: new Date("2026-05-10T00:00:00.000Z"),
      };
    },
    async findArticlesByPath(query: string) {
      if (query === "校园") {
        return [
          {
            path: "生活/校园卡",
            title: "校园卡",
            description: null,
            tags: ["生活"],
            updatedAt: "2026-05-11T00:00:00.000Z",
            publishedAt: "2026-05-10T00:00:00.000Z",
          },
        ];
      }

      return [];
    },
    async listRecentArticles() {
      return [
        {
          path: "生活/校园卡",
          title: "校园卡",
          description: null,
          tags: ["生活"],
          updatedAt: "2026-05-11T00:00:00.000Z",
          publishedAt: "2026-05-10T00:00:00.000Z",
        },
      ];
    },
    async listAllPublishedArticles() {
      return [
        {
          path: "生活/校园卡",
          title: "校园卡",
          description: null,
          tags: ["生活"],
          updatedAt: "2026-05-11T00:00:00.000Z",
          publishedAt: "2026-05-10T00:00:00.000Z",
        },
        {
          path: "学习/图书馆",
          title: "图书馆",
          description: null,
          tags: ["学习"],
          updatedAt: "2026-05-10T00:00:00.000Z",
          publishedAt: "2026-05-09T00:00:00.000Z",
        },
      ];
    },
    async listRelatedArticles() {
      return [
        {
          path: "学习/图书馆",
          title: "图书馆",
          description: null,
          tags: ["学习"],
          updatedAt: "2026-05-10T00:00:00.000Z",
          publishedAt: "2026-05-09T00:00:00.000Z",
        },
      ];
    },
  };

  const pathSearch = await searchWikiPaths("校园", 5, deps);
  const recent = await getRecentWikiArticles(5, deps);
  const related = await getRelatedWikiArticles("生活/校园卡", 5, deps);
  const categories = await listWikiCategories(5, deps);

  assert.equal(pathSearch.matches.length, 1);
  assert.equal(recent.articles[0]?.path, "生活/校园卡");
  assert.equal(related.found, true);
  assert.match(related.articles[0]?.path ?? "", /学习\/图书馆/);
  assert.equal(categories.categories[0]?.name, "学习");
});
