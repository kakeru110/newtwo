// CLAUDE.md 4.3: トピックごとに「事実」「論点(あれば)」「未検証の主張(あれば)」を生成する。
//
// スキーマは composable にしている(1トピック1タイプに固定しない):
// - facts: 常に生成(客観的事実)
// - issues[]: 実際に賛否・立場が分かれている場合のみ。無ければ空配列。
// - claims[]: ネット上等で言われているが一次情報での裏付けが薄い主張がある場合のみ。
//             web_search ツールで裏付け調査を行い、verification に確認結果を書く。無ければ空配列。
// - developing: 事実そのものがまだ確定・更新中(進行中の災害・捜査等)なら true。
//
// 事実(何が起きたか)と論調(どう評価されているか)は明確に分離する。
// 賛否は無理に作らない(根拠が薄い場合はissuesを空配列のままにする)。

import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MODEL = "claude-opus-5";

const client = new Anthropic(); // ANTHROPIC_API_KEY を環境変数から読む

function buildAnalyzePrompt(topic, dateStr) {
  const articleList = topic.articles
    .map((a) => `- 媒体: ${a.source}\n  見出し: ${a.title}\n  リード文: ${a.summary}\n  URL: ${a.link}`)
    .join("\n");

  return `あなたは中立的な報道分析アシスタントです。以下は「${topic.topicTitle}」という
同一トピックについて、複数メディアが報じた見出し・リード文です。

${articleList}

# タスク
上記の記事群をもとに、次のJSONスキーマに厳密に従って分析結果を1つ生成してください。
必要に応じて web_search ツールを使ってよい(用途は下記ルール3のみ)。
最終的な出力は、他の文章(前置き・説明・コードブロックの \`\`\` など)を一切付けず、JSONのみにすること。

# 生成ルール(厳守)
1. facts: 各媒体が共通して報じている客観的事実のみを2〜3文で要約する。意見・評価・論調は絶対に含めない。
   金額・件数などの具体的な数値情報があれば積極的に含める。
2. developing: 死者数・被害規模・捜査状況などの事実そのものがまだ変動中・未確定の話題は true、
   すでに確定した出来事の話題は false にする。

3. issues(論点): このトピックについて、実際に賛成/反対や複数の立場が分かれていると
   記事群から読み取れる場合のみ、論点を1〜2個挙げる。
   - 単に「賛否両論あるはずだ」という推測だけで作らないこと。記事群に実際に異なる論調・立場の
     手がかりが無い場合は issues を空配列 [] のままにすること(捏造禁止)。
   - 各issueについて "for"(賛成/肯定/推進)と"against"(反対/懸念/慎重)を書く。
     summaryは実際の記事の論調を根拠に必ず言い換えて2〜3文以内。原文の引用・コピーは禁止。
   - 該当する立場の記事が無ければ summary を空文字列、sources を空配列にする。
   - sourcesには、その要約の根拠にした媒体名のみを列挙する(記事に実在する媒体名のみ)。

4. claims(未検証の主張): 記事群の中に「ネット上の指摘」「一部で言われている」のような、
   一次情報で裏付けが薄い主張が含まれている場合のみ挙げる。無ければ空配列 [] のままにする。
   - 該当する主張があれば、web_search ツールを使って信頼できる情報源(報道機関・公式発表等)で
     裏付けや反論が見つかるか調べる。検索は多くとも数回まで。
   - verification には、調べて分かったこと(裏付けが複数の報道で確認できた/当事者が否定している/
     憶測の域を出ない、等)を2〜3文で書く。検索しても何も見つからなければその旨を書く。
   - sourcesには、verificationの根拠にした記事の {source, url} を列挙する
     (web_searchで見つけた実在するURLのみ。存在しないURLを書かない)。

5. sourceLinks: 入力として渡された記事全件を {source, url} の配列で列挙する(重複除去)。
6. topicId, topicTitle, generatedAt, aiGenerated は入力値・現在時刻をそのまま使う。

# 出力JSONスキーマ
{
  "topicId": "${topic.topicId}",
  "topicTitle": "${topic.topicTitle}",
  "facts": "客観的な出来事の要約(2〜3文、意見を含まない)",
  "developing": false,
  "issues": [
    {
      "issue": "論点の短文",
      "for": { "summary": "賛成側の要約", "sources": ["媒体名"] },
      "against": { "summary": "反対側の要約", "sources": ["媒体名"] }
    }
  ],
  "claims": [
    {
      "claim": "ネット上等で言われている主張の短い要約",
      "verification": "web_searchで調べた結果の要約",
      "sources": [{ "source": "媒体名", "url": "URL" }]
    }
  ],
  "sourceLinks": [{ "source": "媒体名", "url": "URL" }],
  "generatedAt": "${new Date().toISOString()}",
  "aiGenerated": true
}`;
}

async function analyzeTopic(topic) {
  const prompt = buildAnalyzePrompt(topic);
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
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
    const result = await analyzeTopic(topic);
    topics.push(result);
  }

  const output = {
    date: dateStr,
    generatedAt: new Date().toISOString(),
    aiGenerated: true,
    disclaimer: "本コンテンツはAIが自動生成しています。詳細は各出典元をご確認ください。",
    topics,
  };

  const outPath = path.join(process.cwd(), "public", "data", `${dateStr}.json`);
  await writeFile(outPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`トピック数: ${topics.length}`);
  console.log(`出力先: ${outPath}`);
}

main();
