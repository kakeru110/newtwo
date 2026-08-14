// CLAUDE.md 3章のRSSソース一覧。
//
// 検証の結果、読売新聞・産経新聞・日本経済新聞・Bloomberg Japan・Reuters Japan・
// TechCrunch Japanは一般向けの公式RSSが確認できなかった(廃止済み、または非公開)。
// media/media-lean-note.md に検証結果を記録している。
// これらの媒体は Yahoo!ニュース のカテゴリRSS経由で間接的に収集する
// (Yahoo!ニュースは記事ごとに配信元の新聞社・通信社をld+json (schema.org
// NewsArticle) の author.name として明示しており、これを実際の source として
// 正規化することで媒体の偏りを補正する)。

export const DIRECT_FEEDS = [
  { source: "NHKニュース", url: "https://www3.nhk.or.jp/rss/news/cat0.xml", category: "総合" },
  { source: "朝日新聞", url: "https://www.asahi.com/rss/asahi/newsheadlines.rdf", category: "総合" },
  { source: "毎日新聞", url: "https://mainichi.jp/rss/etc/mainichi-flash.rss", category: "総合" },
  { source: "ITmedia", url: "https://rss.itmedia.co.jp/rss/2.0/itmedia_all.xml", category: "テック" },
  { source: "AFPBB News", url: "http://feeds.afpbb.com/rss/afpbb/afpbbnews", category: "国際" },
];

// Yahoo!ニュースのトピックスRSS。ここから記事単位で配信元(読売/産経/日経/
// Bloomberg/共同通信/時事通信等)をld+jsonから解決する。
export const YAHOO_TOPIC_FEEDS = [
  { category: "国内", url: "https://news.yahoo.co.jp/rss/topics/domestic.xml" },
  { category: "国際", url: "https://news.yahoo.co.jp/rss/topics/world.xml" },
  { category: "経済", url: "https://news.yahoo.co.jp/rss/topics/business.xml" },
  { category: "IT", url: "https://news.yahoo.co.jp/rss/topics/it.xml" },
];

// Yahoo!ニュース経由の記事のうち、これらは自媒体(Yahoo!ニュース自身の一次配信や
// 天気・スポーツ専門媒体など)扱いとし、論点の賛否比較には使わない候補として
// 除外検討の目安にする(完全な除外はcluster/analyze側の判断に委ねる)。
export const YAHOO_LOW_SIGNAL_SOURCES = new Set([
  "ウェザーマップ",
  "tenki.jp",
]);
