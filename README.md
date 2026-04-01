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

- Node.js >= 18
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
