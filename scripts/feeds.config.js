// CLAUDE.md 3章のRSSソース一覧。
//
// 検証の結果、以下の理由で当初想定していた媒体の多くが除外となった。
// 詳細は media-check-notes.md 相当の記録として、このコメントに残す。
//
// - 読売新聞・産経新聞・日本経済新聞・Bloomberg Japan・Reuters Japan・
//   TechCrunch Japan: 一般向けの公式RSSが確認できなかった(廃止済み、または非公開)
// - NHKニュース・朝日新聞・毎日新聞・共同通信・時事通信・TBS NEWS DIG:
//   RSSは存在するが、robots.txtで ClaudeBot / anthropic-ai 等のAIクローラーを
//   名指しでサイト全体禁止(Disallow: /)しており、収集対象から除外した
// - Yahoo!ニュース経由の間接収集: Yahoo自身が「機械的なクロール・スクレイピングは
//   RSS/robots.txtで許可された範囲のみ」としており、記事ページを個別に読みに行く
//   実装は規約の趣旨に反すると判断し、取りやめた
//
// 結果、robots.txtでAI系クローラーの制限が無いことを確認できた3媒体のみを対象とする。
export const DIRECT_FEEDS = [
  { source: "ITmedia", url: "https://rss.itmedia.co.jp/rss/2.0/itmedia_all.xml", category: "テック" },
  { source: "AFPBB News", url: "http://feeds.afpbb.com/rss/afpbb/afpbbnews", category: "国際" },
  { source: "FNNプライムオンライン", url: "https://www.fnn.jp/list/feed/rss", category: "総合" },
];
