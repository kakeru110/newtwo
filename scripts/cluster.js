// CLAUDE.md 4.2: 全メディアの見出し+リード文をClaudeに渡し、
// 「同一の出来事・トピックを報じている記事」をグルーピングする。
// 出力: [{topicId, topicTitle, articles: [...]}]
// 各グループは最低2媒体以上の言及があるものを採用する(1媒体のみの話題は除外)。

import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MODEL = "claude-sonnet-5";

const client = new Anthropic(); // ANTHROPIC_API_KEY を環境変数から読む

function buildClusterPrompt(articles, dateStr) {
  const list = articles
    .map((a, i) => `[${i}] source=${a.source} | title=${a.title} | summary=${a.summary}`)
    .join("\n");

  return `あなたはニュース編集アシスタントです。以下は${dateStr}の直近24時間に配信された、
複数メディアのニュース見出し・リード文の一覧です(各行が1記事、[番号] source=媒体名 | title=見出し | summary=リード文)。

# タスク
同一の出来事・同一トピックを報じている記事どうしをグルーピングしてください。

# ルール
- 1つのグループは同一の具体的な出来事・トピックについての記事のみで構成すること(単なる同じカテゴリではなく、同一事象であること)
- 各グループは異なる媒体からの記事が最低2媒体以上含まれる場合のみ採用する(1媒体しか言及していない話題は除外してよい)
- グループのタイトル(topicTitle)は特定の媒体の見出しをそのまま使わず、中立的な短い日本語で言い換えること
- topicIdは "${dateStr}-001" のような連番形式にすること
- 出力は次のJSONスキーマのみを、他の文章を付けずに返すこと:

[
  {
    "topicId": "${dateStr}-001",
    "topicTitle": "トピックの中立的な見出し",
    "articleIndices": [0, 3, 7]
  }
]

# 記事一覧
${list}`;
}

async function clusterArticles(articles, dateStr) {
  const prompt = buildClusterPrompt(articles, dateStr);
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  const clusters = JSON.parse(json);

  return clusters.map((c) => ({
    topicId: c.topicId,
    topicTitle: c.topicTitle,
    articles: c.articleIndices.map((i) => articles[i]).filter(Boolean),
  }));
}

async function main() {
  const dateStr = new Date().toISOString().slice(0, 10);
  const inPath = path.join(process.cwd(), ".cache", "collected.json");
  const articles = JSON.parse(await readFile(inPath, "utf-8"));

  const clusters = await clusterArticles(articles, dateStr);

  const outPath = path.join(process.cwd(), ".cache", "clusters.json");
  await writeFile(outPath, JSON.stringify(clusters, null, 2), "utf-8");
  console.log(`クラスタ数: ${clusters.length}`);
  console.log(`出力先: ${outPath}`);
}

main();
