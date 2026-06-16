import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  migrateArticlesDirectory,
  migrateHtmlArticle,
  migrateMarkdownArticle,
} from "@/lib/articles/markdown-migrate";
import { I18nProvider } from "@/lib/i18n/provider";
import { en } from "@/lib/i18n/dictionaries/en";

test("markdown migration converts wiki.js syntax to the new markdown dialect", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "article-migrate-md-"));

  try {
    await writeFile(path.join(tempDir, "asset.png"), "binary");

    const migrated = migrateMarkdownArticle(
      `---
title: Demo
---
> 提示内容
> 第二行
{.is-info}

##### Tabset {.tabset}

###### 苹果
![示例](/asset.png =320x180)

###### 橘子
说明^[旧脚注]

<center>居中文字</center>
`,
      {
        absolutePath: path.join(tempDir, "demo.md"),
        assetIndex: {
          articleRoot: tempDir,
          bySuffix: new Map([["/asset.png", ["/asset.png"]]]),
        },
        warnings: [],
      },
    );

    assert.match(migrated, /> \[!TIP\]/);
    assert.match(migrated, /> 提示内容/);
    assert.match(migrated, /::tabs/);
    assert.match(migrated, /tabs: \["苹果", "橘子"\]/);
    assert.match(migrated, /!\[示例\]\(\/asset\.png "width=320 height=180"\)/);
    assert.match(migrated, /说明\[\^legacy-note-1\]/);
    assert.match(migrated, /\[\^legacy-note-1\]: 旧脚注/);
    assert.doesNotMatch(migrated, /<center>/);

    const { MarkdownRenderer } = await import("@/components/markdown-renderer");
    const html = renderToStaticMarkup(
      <I18nProvider dictionary={en} locale="en">
        <MarkdownRenderer markdown={migrated} />
      </I18nProvider>,
    );

    assert.match(html, /role="tablist"/);
    assert.doesNotMatch(html, /<center>/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("html migration converts frontmatter comments, figures, and paragraphs", () => {
  const warnings: string[] = [];
  const migrated = migrateHtmlArticle(
    `<!--
title: 图书馆
description: 简介
published: true
date: 2025-02-19T04:27:18.883Z
tags:
editor: ckeditor
dateCreated: 2024-12-28T09:03:23.435Z
-->

<figure class="image"><img src="/图片/图书馆.jpg"><figcaption>图书馆正门</figcaption></figure>
<p>&nbsp; 图书馆介绍。</p>
`,
    { warnings },
  );

  assert.match(migrated, /^---\ntitle: 图书馆/m);
  assert.match(migrated, /!\[图书馆正门\]\(\/图片\/图书馆\.jpg\)/);
  assert.match(migrated, /\n图书馆正门\n/);
  assert.match(migrated, /\n图书馆介绍。\n$/);
  assert.deepEqual(warnings, []);
});

test("html migration falls back for complex tables and records warnings", () => {
  const warnings: string[] = [];
  const migrated = migrateHtmlArticle(
    `<!--
title: 表格
description:
published: true
date: 2025-02-19T04:27:18.883Z
tags:
editor: ckeditor
dateCreated: 2024-12-28T09:03:23.435Z
-->
<table>
  <tr><td rowspan="2">学院</td><td>专业</td></tr>
  <tr><td>备注</td></tr>
</table>
`,
    { warnings },
  );

  assert.match(migrated, /- 学院 \| 专业/);
  assert.match(warnings.join("\n"), /complex HTML table/);
});

test("directory migration rewrites markdown, converts html, and deletes old html sources", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "article-migrate-dir-"));

  try {
    await writeFile(path.join(tempDir, "wrong-path.png"), "binary");
    await writeFile(
      path.join(tempDir, "notes.md"),
      `> 信息
{.is-info}

![](/wrong-path.png =200x)
`,
    );
    await writeFile(
      path.join(tempDir, "page.html"),
      `<!--
title: Demo Html
description:
published: true
date: 2025-02-19T04:27:18.883Z
tags:
editor: ckeditor
dateCreated: 2024-12-28T09:03:23.435Z
-->
<p>正文</p>
`,
    );

    const summary = await migrateArticlesDirectory(tempDir, {
      info() {},
      warn() {},
    });

    assert.equal(summary.markdownFiles, 1);
    assert.equal(summary.htmlFiles, 1);
    assert.equal(summary.deletedHtmlFiles, 1);

    const markdown = await readFile(path.join(tempDir, "page.md"), "utf8");
    assert.match(markdown, /^---\ntitle: Demo Html/m);
    assert.match(markdown, /\n正文\n$/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
