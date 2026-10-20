# aihive 開発ガイド

tmux 上で複数の AI エージェント（Orchestrator / Coordinator / Worker / Reviewer / Scout）を動かす TUI ツールです。React Ink 製で、TypeScript で書かれています。

## 確認コマンド

作業を終える前に、次の 3 つがすべて通ることを確認してください。CI（Node.js 22 / 24）でも同じものを実行します。

```bash
npm run typecheck   # 型チェック (tsc --noEmit)
npm run check       # Lint / Format (Biome)。整形は npm run check:fix
npm test            # テスト (Vitest)
```

- Biome の既存の警告（`noArrayIndexKey` など）は残っていて構いません。新しいエラーや警告を増やさないでください。
- 動作確認で TUI を起動するときは `npm run dev`（ビルド不要）、ビルドは `npm run build` です。`dist/` は生成物なので編集しないでください。

## 構成

- `src/bin/aihive.tsx` — エントリーポイント
- `src/components/` — Ink の画面コンポーネント（`App.tsx` がメッセージ処理と状態の中心）
- `src/lib/` — コアロジック（`mailbox.ts` メッセージ、`tasks.ts` タスク、`skills.ts` スキル、`memory.ts` メモリ、`tmux.ts` / `cli-registry.ts` エージェント起動、`config.ts` 設定）
- `src/locales/` — 画面の文言（`ja.ts` と `en.ts` の両方に追加する）
- `instructions/*.md` — 各ロールのエージェントに渡す指示ファイル

## 規約

- テストは対象と同じ階層の `__tests__/` に `*.test.ts(x)` で置きます。振る舞いを変えたら、それを確かめるテストを追加してください。
- エージェントが書くファイル（メッセージ、スキル、メモリ）は信頼できない入力として扱い、`src/lib/validate.ts` などで検証してから使います。
- `instructions/*.md` の変更は、ユーザーが書き換えていなければ次回起動時に `~/.aihive/instructions/` へ自動で反映されます（`src/lib/instructions.ts`）。
- コミットメッセージは英語で、`feat:` / `fix:` / `test:` / `chore:` などの接頭辞を付けます。
- `package.json` の `version` を上げて main にマージすると、GitHub Actions がリリースを作成します。バージョンは指示がない限り変えないでください。
