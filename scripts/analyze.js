// CLAUDE.md 4.3: トピックごとに「論点」「賛否要約」「事実」を生成する。
// - 論点(何が争点か)を1〜2個
// - 各論点について賛成側/反対側の主張を、各媒体の論調から要約(原文コピー禁止、言い換え、各ソース2〜3文まで)
// - どのメディアの論調を参照したかを sources に明記(透明性)
// - 事実(何が起きたか)と論調(どう評価されているか)を分離する

import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MODEL = "claude-sonnet-5";

const client = new Anthropic(); // ANTHROPIC_API_KEY を環境変数から読む

function buildAnalyzePrompt(topic, dateStr) {
  const articleList = topic.articles
    .map((a) => `- 媒体: ${a.source}\n  見出し: ${a.title}\n  リード文: ${a.summary}\n  URL: ${a.link}`)
    .join("\n");

  return `あなたは中立的な報道分析アシスタントです。以下は「${topic.topicTitle}」という
同一トピックについて、複数メディアが報じた見出し・リード文です。

${articleList}

# タスク
上記の記事群から、次のJSONスキーマに厳密に従って分析結果を1つ生成してください。
他の文章(前置き・説明・コードブロックの \`\`\` など)は一切付けず、JSONのみを出力すること。

# 生成ルール(厳守)
1. facts: 各媒体が共通して報じている客観的事実のみを2〜3文で要約する。意見・評価・論調は絶対に含めない。
2. issues: このトピックにおける「論点(何が争点になっているか)」を1〜2個、短い一文で挙げる。
   単なる出来事の説明ではなく、賛否・立場が分かれる点を論点とすること。
3. 各issueについて、"for"(賛成/肯定/推進する立場)と"against"(反対/懸念/慎重な立場)を書く。
   - 各summaryは、実際の記事の論調を根拠に、必ず言い換えて2〜3文以内で書く(原文の引用・コピーは禁止)。
   - 該当する立場の記事が実際に存在しない場合は、summaryを空文字列にし、sourcesも空配列にすること。事実を捏造しないこと。
   - sourcesには、その立場の要約の根拠にした媒体名のみを列挙する(記事に実在する媒体名のみ。存在しない媒体名を書かない)。
4. sourceLinks: 参照した全記事を {source, url} の配列で列挙する(重複除去)。
5. topicId, topicTitle, generatedAt, aiGenerated は入力値・現在時刻をそのまま使う。

# 出力JSONスキーマ
{
  "topicId": "${topic.topicId}",
  "topicTitle": "${topic.topicTitle}",
  "facts": "客観的な出来事の要約(2〜3文、意見を含まない)",
  "issues": [
    {
      "issue": "論点の短文",
      "for": { "summary": "賛成側の要約", "sources": ["媒体名"] },
      "against": { "summary": "反対側の要約", "sources": ["媒体名"] }
    }
  ],
  "sourceLinks": [{ "source": "媒体名", "url": "URL" }],
  "generatedAt": "${new Date().toISOString()}",
  "aiGenerated": true
}`;
}

async function analyzeTopic(topic, dateStr) {
  const prompt = buildAnalyzePrompt(topic, dateStr);
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json);
}

async function main() {
  const dateStr = new Date().toISOString().slice(0, 10);
  const inPath = path.join(process.cwd(), ".cache", "clusters.json");
  const clusters = JSON.parse(await readFile(inPath, "utf-8"));

  const topics = [];
  for (const topic of clusters) {
    const result = await analyzeTopic(topic, dateStr);
    topics.push(result);
  }

  const output = {
    date: dateStr,
    generatedAt: new Date().toISOString(),
    aiGenerated: true,
    disclaimer: "本コンテンツはAIが自動生成しています。詳細は各出典元をご確認ください。",
    topics,
  };

  const outPath = path.join(process.cwd(), "data", `${dateStr}.json`);
  await writeFile(outPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`トピック数: ${topics.length}`);
  console.log(`出力先: ${outPath}`);
}

main();
