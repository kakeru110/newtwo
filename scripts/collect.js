// CLAUDE.md 4.1: 各RSSを取得し {title, summary, link, source, pubDate} に正規化する。
// 直近24時間分のみを対象とする。本文スクレイピングは行わない(RSSに含まれる
// タイトル・リード文のみを読む。個別記事ページへのアクセスは行わない)。

import Parser from "rss-parser";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DIRECT_FEEDS } from "./feeds.config.js";

const HOURS_WINDOW = 24;
// robots.txtでAI系クローラーを制限していない媒体のみをRSSの範囲内で読みに行うため、
// ブラウザを装わず素性を明かすUser-Agentを使う。
const USER_AGENT = "MultiViewNewsBot/0.1 (+https://github.com/kakeru110/newtwo)";
const pExecFile = promisify(execFile);

const parser = new Parser({
  headers: { "User-Agent": USER_AGENT },
  timeout: 15000,
});

// 媒体によってはNode(undici)のTLS/HTTPフィンガープリントをボット判定して403を
// 返すことがある(RSS自体へのアクセス制限ではなく、undiciクライアント特有の問題)。
// その場合のみ、curlコマンドでのフェッチにフォールバックする。
async function fetchTextWithFallback(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15000) });
    if (res.ok) return await res.text();
    if (res.status !== 403) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    if (err.name === "AbortError") throw err;
  }
  const { stdout } = await pExecFile(
    "curl",
    ["-sS", "-m", "15", "-A", USER_AGENT, "-L", url],
    { maxBuffer: 1024 * 1024 * 20 }
  );
  return stdout;
}

function withinWindow(pubDate, hours = HOURS_WINDOW) {
  if (!pubDate) return false;
  const t = new Date(pubDate).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= hours * 60 * 60 * 1000;
}

async function collectDirectFeed({ source, url }) {
  try {
    const xml = await fetchTextWithFallback(url);
    const feed = await parser.parseString(xml);
    return feed.items
      .map((item) => ({
        title: (item.title || "").trim(),
        summary: (item.contentSnippet || item.summary || item.content || "").trim(),
        link: item.link || "",
        source,
        pubDate: item.isoDate || item.pubDate || "",
      }))
      .filter((a) => a.title && a.link && withinWindow(a.pubDate));
  } catch (err) {
    console.warn(`[collect] ${source} の取得に失敗: ${err.message}`);
    return [];
  }
}

function dedupe(articles) {
  const seen = new Set();
  const out = [];
  for (const a of articles) {
    const key = `${a.source}::${a.link}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

async function main() {
  const results = await Promise.all(DIRECT_FEEDS.map(collectDirectFeed));

  const all = dedupe(results.flat()).sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  const outDir = path.join(process.cwd(), ".cache");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "collected.json");
  await writeFile(outPath, JSON.stringify(all, null, 2), "utf-8");

  const bySource = all.reduce((acc, a) => {
    acc[a.source] = (acc[a.source] || 0) + 1;
    return acc;
  }, {});

  console.log(`収集件数: ${all.length}件`);
  console.log("媒体別内訳:", bySource);
  console.log(`出力先: ${outPath}`);
}

main();
