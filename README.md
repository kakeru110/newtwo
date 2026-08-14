# 多面ニュース解説サイト

毎日の主要ニュースをAIが収集・クラスタリングし、トピックごとの「論点」を軸に賛否・立場を整理して表示するサイト。仕様の詳細は `CLAUDE.md` を参照。

## 構成

```
scripts/        収集・クラスタリング・分析パイプライン(Node.js)
public/         フロントエンド(単一HTMLのReact PWA)+ 生成された /data/*.json
  index.html      アプリ本体(React/ReactDOM/BabelはCDNを使わずpublic/vendor/に同梱)
  data/           日付ごとのニュースデータ(パイプラインが生成・コミット)
.github/workflows/pipeline.yml   1日2回(7時・19時 JST)実行するGitHub Actions
vercel.json      Vercel用の静的サイト設定(public/を配信)
```

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

## Vercelへのデプロイ

1. VercelでこのGitHubリポジトリをインポートする。
2. Framework Preset は「Other」のままでよい(`vercel.json` が `public/` を配信するよう設定済み)。
3. 環境変数の設定は不要(データ生成はGitHub Actions側で行うため、Vercelはビルド不要の静的サイトとして配信するだけ)。
4. GitHub Actionsが `public/data/*.json` をコミットするたびに、Vercelが自動で再デプロイする。
