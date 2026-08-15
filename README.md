# 多面ニュース解説サイト

毎日の主要ニュースをAIが収集・クラスタリングし、記事に書かれていない事実や論点を補って多面的に見せるサイト。仕様の詳細は `CLAUDE.md` を参照。

## ニュースソースについて

CLAUDE.md 3章では読売・産経・日経・NHK・朝日・毎日などを想定していたが、検証の結果、多くのRSSが廃止済み、または `robots.txt` でAIクローラー(ClaudeBot / anthropic-ai 等)を名指しでサイト全体禁止していることが分かった。Yahoo!ニュース経由での間接収集も検討したが、Yahoo自身が「機械的なクロール・スクレイピングはRSS/robots.txtで許可された範囲のみ」としており、記事ページを個別に読みに行く方式は規約の趣旨に反すると判断し取りやめた。

最終的に、`robots.txt` でAI系クローラーの制限が無いことを確認できた **ITmedia・AFPBB News・FNNプライムオンライン** の3媒体のみを収集対象にしている(`scripts/feeds.config.js` にも経緯を記載)。政治的立場の対立軸を意図的に混ぜるという当初のコンセプトは実現できていないが、本サイトの目的は「賛否の政治的バランス」よりも「記事だけでは分からない事実・背景を補って読者の判断材料を増やす」ことなので、issues(論点)は実際に対立点がある場合のみ、claims(未検証の主張の裏付け調査)を中心にする設計にしている。

## 構成

```
scripts/        収集・クラスタリング・分析パイプライン(Node.js)
public/         フロントエンド(単一HTMLのReact PWA)+ 生成された /data/*.json
  index.html      アプリ本体(React/ReactDOM/BabelはCDNを使わずpublic/vendor/に同梱)
  data/           日付ごとのニュースデータ(パイプラインが生成・コミット)
.github/workflows/pipeline.yml       1日2回(7時・19時 JST)ニュースを生成するGitHub Actions
.github/workflows/deploy-pages.yml   public/の変更をGitHub Pagesへ自動デプロイするGitHub Actions
```

フロントエンドの各パス参照(`vendor/`・`data/`・`manifest.webmanifest`・`sw.js`)はすべて相対パスにしてあります。GitHub Pagesのプロジェクトサイトは `https://<ユーザー名>.github.io/<リポジトリ名>/` のようにサブパス配信になるため、絶対パス(`/vendor/...`等)だと壊れます。

## セットアップ

```sh
npm install
```

パイプラインをローカルで実行するには `ANTHROPIC_API_KEY` を環境変数に設定してください。

```sh
export ANTHROPIC_API_KEY=sk-ant-...
npm run collect   # RSS収集 → .cache/collected.json
npm run cluster   # クラスタリング → .cache/clusters.json
npm run analyze   # 論点抽出・賛否要約 → public/data/YYYY-MM-DD.json
# まとめて実行:
npm run pipeline
```

## フロントエンドのローカル確認

`public/` をそのまま静的配信すれば動作します(ビルド不要)。

```sh
cd public && python3 -m http.server 8000
```

`http://localhost:8000/` を開くと、その日付の `data/YYYY-MM-DD.json` を取得して表示します。データが無い日付は「まだありません」と表示されます。

## GitHub Actionsの設定

1. リポジトリの Settings → Secrets and variables → Actions で `ANTHROPIC_API_KEY` を登録する。
2. `.github/workflows/pipeline.yml` は `workflow_dispatch`(手動実行)にも対応しているので、まずは Actions タブから手動実行して数日分の出力品質を確認してから、定期実行(cron)に任せることを推奨(CLAUDE.md 7章の方針どおり)。

## GitHub Pagesへのデプロイ

1. リポジトリの Settings → Pages → Build and deployment → Source を「GitHub Actions」に設定する(初回のみ、手動での一回きりの設定)。
2. `main` ブランチに `public/` 配下の変更がpushされると、`.github/workflows/deploy-pages.yml` が自動でGitHub Pagesにデプロイする。Actionsタブから `workflow_dispatch` で手動実行も可能。
3. 環境変数の設定は不要(データ生成はGitHub Actions側の別ワークフローで行うため、Pagesへのデプロイはビルド不要の静的配信のみ)。
4. デプロイ後のURLは `https://<ユーザー名>.github.io/<リポジトリ名>/`(Settings → Pages に表示される)。
5. `pipeline.yml` が `public/data/*.json` をコミット・pushするたびに、このワークフローが連鎖して再デプロイされる。
