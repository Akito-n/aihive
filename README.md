# aihive

tmux + AI Coding CLI を使ったマルチエージェントオーケストレーションシステム。React Ink による TUI で複数の AI エージェントを一つの画面から管理・操作できます。

## Features

- **マルチエージェント管理** - tmux セッション上で複数の AI エージェント（orchestrator, coordinator, worker, reviewer, scout）を同時起動
- **マルチ CLI 対応** - Claude Code, OpenAI Codex, Gemini CLI をエージェントごとに選択可能
- **React Ink TUI** - ターミナル内でリッチな UI を提供（ANSI カラー対応、リアルタイム出力表示）
- **Quick Commands** - `//` で呼び出せるカスタムコマンドメニュー（`.aihive/commands/*.yml` で定義）
- **ロールベースのインストラクション** - エージェントの役割に応じた指示ファイルを自動適用
- **メールボックスシステム** - エージェント間の非同期メッセージング

## Prerequisites

- Node.js >= 22（推奨: 24 LTS。`.nvmrc` あり）
- tmux
- いずれかの AI Coding CLI:
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
  - [OpenAI Codex](https://github.com/openai/codex)
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli)

## Install

```bash
npm install
npm run build
```

## Usage

```bash
# 開発モード
npm run dev

# ビルド後の実行
npm start
```

### 画面構成

1. **メインメニュー** - エージェントの起動、設定、ヘルプ
2. **ダッシュボード** - 全エージェントの出力をリアルタイム表示（Overview / 個別ペーン切替）
3. **Settings** - エージェント名・ロール・CLI・モデルの編集、Quick Commands の管理

### Quick Commands

`.aihive/commands/` ディレクトリに YAML ファイルを配置すると、ダッシュボード画面で `//` を入力してメニューから呼び出せます。

```yaml
# .aihive/commands/code-review.yml
name: Code Review
category: review
description: 現在の差分をレビューしてもらう
prompt: |
  現在の git diff を確認して、コードレビューをしてください。
  バグ、パフォーマンス、セキュリティの観点からフィードバックをお願いします。
```

### エージェント構成

`~/.aihive/config.yaml` でエージェント構成をカスタマイズできます。TUI の Settings 画面からも編集可能です。

```yaml
session: aihive
agents:
  - name: Orchestrator
    role: orchestrator
    model: opus
  - name: Coordinator
    role: coordinator
    model: sonnet
  - name: Worker 1
    role: worker
    model: sonnet
```

### ロール

| Role | 説明 | デフォルトモデル |
|------|------|-----------------|
| orchestrator | 全体の方針策定・タスク分解 | opus |
| coordinator | タスクの割り振り・進捗管理 | sonnet |
| worker | 実装・コーディング | sonnet |
| reviewer | コードレビュー | sonnet |
| scout | コードベース調査（読み取り専用） | opus |

### Worker ごとの作業場所

プロジェクトが git リポジトリの場合、起動時に Worker ごとのブランチ（`aihive/worker-1` など）と作業フォルダ（git worktree）を `~/.aihive/worktrees/` に作ります。Worker は自分のフォルダで作業してブランチにコミットし、Reviewer が確認コマンドを通してから、プロジェクトでチェックアウト中のブランチにマージします。push や PR 作成はエージェントには行わせません。

- 作業フォルダは次回の起動でもそのまま使われます。未コミットの変更も消えません
- `node_modules` はプロジェクトのものをリンクして共有します
- 無効にするには `~/.aihive/config.yaml` に `worktrees: false` を書きます

### 止まったタスク

15 分間更新のないタスク（待機中・作業中・レビュー中）は、ダッシュボードに ⏱ 付きで上のほうに表示されます。担当のエージェントには、作業を続けるよう一度だけ知らせます。タスクがまた動いてから止まったときは、もう一度知らせます。待つ時間は `~/.aihive/config.yaml` の `stallMinutes: 30` などで変えられ、`stallMinutes: 0` で止められます。

### 指示ファイル

各ロールの指示ファイルは起動時に `~/.aihive/instructions/{role}.md` へコピーされます。言語を English にすると英語版（`instructions/en/`）が使われ、通知文や `APPROVED.md` も英語になります。aihive を更新すると、自分で書き換えていない指示ファイルは新しい版に自動で置き換わります。書き換えたファイルはそのまま残り、ログに「Instructions kept」と表示されます。新しい版に戻したい場合は、そのファイルを削除して再起動してください。

## Development

```bash
npm test            # テスト (Vitest)
npm run typecheck   # 型チェック (TypeScript)
npm run check       # Lint / Format チェック (Biome)
npm run check:fix   # Lint / Format の自動修正
```

CI（GitHub Actions）では Node.js 22 / 24 で上記の型チェック・Lint・テストを実行します。

### 主な技術スタック

| 用途 | ライブラリ |
|------|-----------|
| TUI | [Ink](https://github.com/vadimdemedes/ink) 8 + React 19 |
| 言語 | TypeScript 7 |
| テスト | Vitest 5 |
| Lint / Format | Biome 2.5 |
| データ保存 | sql.js |

## Project Structure

```
src/
├── bin/aihive.tsx          # エントリーポイント
├── components/             # React Ink UI コンポーネント
│   ├── App.tsx             # メインアプリケーション
│   ├── Dashboard.tsx       # ダッシュボード画面
│   ├── PaneView.tsx        # 個別エージェント出力表示
│   ├── OverviewMode.tsx    # 全エージェント概要表示
│   ├── CommandInput.tsx    # コマンド入力
│   ├── QuickCommandMenu.tsx    # Quick Command メニュー
│   ├── QuickCommandEditor.tsx  # Quick Command エディタ
│   ├── SettingsScreen.tsx  # 設定画面
│   ├── AgentEditor.tsx     # エージェント設定エディタ
│   └── ...
├── lib/                    # コアロジック
│   ├── tmux.ts             # tmux セッション管理
│   ├── config.ts           # 設定ファイル管理
│   ├── cli-registry.ts     # AI CLI レジストリ
│   ├── quick-commands.ts   # Quick Command ローダー
│   ├── ansi.ts             # ANSI エスケープシーケンスパーサー
│   ├── mailbox.ts          # エージェント間メッセージング
│   └── ...
instructions/               # エージェントロール別指示ファイル
```

## License

MIT
