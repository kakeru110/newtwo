// CLAUDE.md 4.1: 各RSSを取得し {title, summary, link, source, pubDate} に正規化する。
// 直近24時間分のみを対象とする。本文スクレイピングは行わない
// (Yahoo!ニュース経由の記事もld+jsonのメタデータ(見出し・リード文)のみを読む)。

import Parser from "rss-parser";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DIRECT_FEEDS, YAHOO_TOPIC_FEEDS } from "./feeds.config.js";

const HOURS_WINDOW = 24;
const USER_AGENT = "Mozilla/5.0";
const YAHOO_CONCURRENCY = 4;
const pExecFile = promisify(execFile);

const parser = new Parser({
  headers: { "User-Agent": USER_AGENT },
  timeout: 15000,
});

// NHK・朝日・毎日などはNode(undici)のTLS/HTTPフィンガープリントをボット判定して
// 403を返すことがある(公開RSSそのものへのアクセス制限ではない)。
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

// <comments> は https://news.yahoo.co.jp/articles/<hash>/comments 形式。
// 末尾の /comments を外すと、schema.org メタデータ付きの記事ページURLになる。
function articleUrlFromItem(item) {
  if (item.comments) {
    return item.comments.replace(/\/comments\/?$/, "");
  }
  return item.link || "";
}

// Yahoo!ニュース記事ページの ld+json (NewsArticle) から
// 見出し・リード文・配信元(新聞社/通信社)のみを取得する。本文は読まない。
async function fetchYahooArticleMeta(articleUrl) {
  const html = await fetchTextWithFallback(articleUrl);
  const match = html.match(
    /<script type="application\/ld\+json">(\{[^]*?"@type":"NewsArticle"[^]*?\})<\/script>/
  );
  if (!match) throw new Error("NewsArticle ld+json not found");
  const data = JSON.parse(match[1]);
  return {
    title: data.headline || "",
    summary: data.description || "",
    source: data.author?.name || "Yahoo!ニュース",
    pubDate: data.datePublished || "",
  };
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function collectYahooFeed({ category, url }) {
  let feed;
  try {
    const xml = await fetchTextWithFallback(url);
    feed = await parser.parseString(xml);
  } catch (err) {
    console.warn(`[collect] Yahoo!ニュース(${category}) の取得に失敗: ${err.message}`);
    return [];
  }

  const candidates = feed.items.filter((item) => withinWindow(item.isoDate || item.pubDate));
  const resolved = await mapWithConcurrency(candidates, YAHOO_CONCURRENCY, async (item) => {
    const articleUrl = articleUrlFromItem(item);
    if (!articleUrl) return null;
    try {
      const meta = await fetchYahooArticleMeta(articleUrl);
      return {
        title: meta.title || item.title || "",
        summary: meta.summary || "",
        link: articleUrl,
        source: meta.source,
        pubDate: meta.pubDate || item.isoDate || item.pubDate || "",
      };
    } catch {
      // メタデータが取れない場合はRSS見出しのみで最低限の情報を残す
      return {
        title: item.title || "",
        summary: "",
        link: item.link || articleUrl,
        source: "Yahoo!ニュース",
        pubDate: item.isoDate || item.pubDate || "",
      };
    }
  });

  return resolved.filter((a) => a && a.title && a.link && withinWindow(a.pubDate));
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
  const directResults = await Promise.all(DIRECT_FEEDS.map(collectDirectFeed));
  const yahooResults = await Promise.all(YAHOO_TOPIC_FEEDS.map(collectYahooFeed));

  const all = dedupe([...directResults.flat(), ...yahooResults.flat()]).sort(
    (a, b) => new Date(b.pubDate) - new Date(a.pubDate)
  );

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
