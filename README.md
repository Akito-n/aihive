<div align="center">

<img src="docs/logo.svg" alt="aihive" width="160">

# aihive

**tmux + AI Coding CLI で複数の AI エージェントを動かす、レトロ RPG 風の TUI**

[![release](https://img.shields.io/github/v/release/Akito-n/aihive)](https://github.com/Akito-n/aihive/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/Akito-n/aihive/ci.yml?label=CI)](https://github.com/Akito-n/aihive/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/Akito-n/aihive)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![tmux](https://img.shields.io/badge/requires-tmux-1BB91F?logo=tmux&logoColor=white)](https://github.com/tmux/tmux)
[![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey)](#prerequisites)

</div>

tmux + AI Coding CLI を使ったマルチエージェントオーケストレーションシステム。React Ink による TUI で複数の AI エージェントを一つの画面から管理・操作できます。

## Features

- **マルチエージェント管理** - tmux セッション上で複数の AI エージェント（orchestrator, coordinator, worker, reviewer, scout）を同時起動
- **マルチ CLI 対応** - Claude Code, OpenAI Codex, Gemini CLI をエージェントごとに選択可能
- **React Ink TUI** - ターミナル内でリッチな UI を提供（ANSI カラー対応、リアルタイム出力表示）
- **Quick Commands** - `//` で呼び出せるカスタムコマンドメニュー（`.aihive/commands/*.yml` で定義）
- **ロールベースのインストラクション** - エージェントの役割に応じた指示ファイルを自動適用
- **メールボックスシステム** - エージェント間の非同期メッセージング
- **Worker ごとの git worktree・確認コマンドの自動実行・完了レポート・通知** - 離れていても作業を進めて結果をまとめて確認
- **レトロ RPG 風の画面とぼうけん** - 終わったタスクに応じてパーティが育ち、ダンジョンを進み、装備を拾います。ゲームはタスクの処理とは完全に切り離されていて、プロンプトや設定には一切影響しません

## Prerequisites

- Node.js >= 22（推奨: 24 LTS。`.nvmrc` あり）
- tmux
- いずれかの AI Coding CLI:
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
  - [OpenAI Codex](https://github.com/openai/codex)
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli)

## Install

[Releases](https://github.com/Akito-n/aihive/releases) の tgz からグローバルにインストールします（例は v0.10.0）。

```bash
pnpm add -g https://github.com/Akito-n/aihive/releases/download/v0.10.0/aihive-0.10.0.tgz
```

起動画面とメインメニューにバージョンが出ます。古い動作のままのときは、別の場所（Volta など）に入った古い aihive が先に見つかっていないか確認してください。

## Usage

作業したいプロジェクトのディレクトリで起動します。

```bash
aihive              # TUI を起動
aihive --evaluate   # Claude Code の会話履歴を評価して XP を得る
aihive --help
```

### 画面構成

1. **メインメニュー** - エージェントの起動、設定、ヘルプ
2. **ダッシュボード** - 全エージェントの出力とクエスト（タスク）をリアルタイム表示。主なキーは次のとおりです
   - `↑`/`↓` で仲間を選び、`Enter` か `i` で話しかける（`//` で Quick Commands）
   - `T` クエスト（タスク）、`O` 全員の様子（Overview）、`L` ログ、`S` つよさ、`E` そうび、`G` おみせ
   - `Tab` で なかまの下の窓（クエスト・ぼうけん・ふくろ）を切り替え。右のペインの下の枠に、状態ごとの人数とクエストの進み具合が出ます
   - `x` で停止、`q` で終了
3. **タスク画面**（ダッシュボードで `T`）- タスクの一覧と、選んだタスクの依頼・結果・確認コマンドの結果。`j`/`k` で選択、`J`/`K` で詳細をスクロール、`f` で未完了・完了・失敗に絞り込み、`Esc` で戻る
4. **ログ画面**（ダッシュボードで `L`）- aihive の動きの記録。最新の行を追い続け、`j`/`k` や PgUp/PgDn でさかのぼれます。`g`/`G` で最初と最新へ、`f` でメッセージ・タスクと確認・警告に絞り込み、`Esc` で戻る
5. **つよさ画面**（`S`）・**そうび画面**（`E`）・**おみせ画面**（`G`）- 下の「ぼうけん」を参照
6. **Settings** - エージェント名・ロール・CLI・モデルの編集、Quick Commands、言語、テーマの管理

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

### 確認の自動実行

`~/.aihive/config.yaml` に確認コマンドを書いておくと、Worker が結果を報告したときに aihive がその Worker の作業フォルダで順番に実行します。結果（成否、失敗したコマンド、出力の末尾、コミット）は `check-result` として Reviewer（いなければ Coordinator）に届きます。

```yaml
checks:
  - npm run typecheck
  - npm test
```

コマンドはシェルで実行されるので、信頼できるものだけを書いてください。1 つのコマンドは 10 分で打ち切られます。

### 完了レポート

すべてのタスクが完了か失敗になり、2 分間動きがなければ、aihive が `.aihive/reports/<日時>.md` に完了レポートを書き出します。タスクごとの状態、最後の担当、かかった時間、確認コマンドの結果（`checks:` を設定しているとき）、結果の本文がまとまっているので、離れていた間の作業をまとめて確認できます。タスクをやり直して終わったときは、新しいレポートが作られます。

### 通知

すべてのタスクが終わったとき、タスクが停滞したとき、確認コマンドが失敗したときに、aihive は端末のベルを鳴らします。`~/.aihive/config.yaml` に `notify: desktop` と書くとデスクトップ通知も出し（macOS、または `notify-send` のある Linux）、`notify: off` で止められます。

### 指示ファイル

各ロールの指示ファイルは起動時に `~/.aihive/instructions/{role}.md` へコピーされます。言語を English にすると英語版（`instructions/en/`）が使われ、通知文や `APPROVED.md` も英語になります。aihive を更新すると、自分で書き換えていない指示ファイルは新しい版に自動で置き換わります。書き換えたファイルはそのまま残り、ログに「Instructions kept」と表示されます。新しい版に戻したい場合は、そのファイルを削除して再起動してください。

### テーマ

画面の見た目は Settings > テーマ で切り替えられ、`~/.aihive/theme` に保存されます。

| テーマ | 説明 |
|--------|------|
| retro（既定） | ドット絵ロゴと枠付きウィンドウの、レトロ RPG 風の画面 |
| classic | 以前のシンプルな画面 |
| ff / gameboy | おみせで 500G で買うと選べるようになる色違いのテーマ |

### ぼうけん

aihive はエージェントをパーティとして持ち、進み具合を `~/.aihive/progress.json` に保存します。ぼうけんは終わったタスクの副産物で、レベル・スキル・装備がプロンプトやモデル、設定、タスクの中身を変えることはありません。待っている間に勝手に進むこともありません。

- **レベル** - タスクが終わると、かかった時間・難しさ（子タスクを持つ親タスクはボス）・確認コマンドの成否・止まらなかったかに応じて、パーティと担当メンバーに XP が入ります。作ってすぐ閉じたタスク（1 分未満）や、同じタスクの 2 回目以降には入りません
- **スキル** - ちから・たいりょく・すばやさ・かしこさが、こなしたタスクの内容とメンバーの職業に応じて伸びます
- **ダンジョン** - タスクが終わるたびにパーティが奥へ進み、モンスターと戦います。10 階ごとにボスがいます。クエスト一覧ではタスクごとにモンスターと、ボスの HP が表示されます
- **そうび** - 戦いで装備を拾います（ボスは必ず落とします）。武器・防具・装飾品の 3 種類で、レア度と追加効果がランダムに決まります。追加効果の多くは枠の色・カーソル・ゲージ・ロゴの色など画面の見た目を変えます。そうび画面で `Enter` 装備、`s` 売る、`v` 見た目の反映を切り替え
- **ひっさつわざ** - Claude Code でスキル（Skill）を呼んだ回数を、`~/.claude/projects` の会話履歴から読み取って数えます（読み取りのみ）。使うほど技のレベルが上がります
- **称号** - 一定の条件（タスク数、階層、深夜の作業など）を満たすと手に入り、つよさ画面に表示されます
- **ゴールド** - 戦いや装備を売って G を得て、おみせでテーマを買えます

`aihive --evaluate` は別の仕組みで、Claude Code の会話履歴を AI CLI で評価してキャラクターの XP（`~/.aihive/game.db`）を増やします。

## Development

```bash
npm install         # 依存関係（package-lock.json）
npm run dev         # ビルドせずに TUI を起動
npm run build       # dist/ にビルド
```

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
│   ├── TaskView.tsx        # クエスト（タスク）画面
│   ├── LogView.tsx         # ログ画面
│   ├── StatusView.tsx      # つよさ画面
│   ├── EquipView.tsx       # そうび画面
│   ├── ShopView.tsx        # おみせ画面
│   ├── ThemeScreen.tsx     # テーマ選択
│   ├── Window.tsx          # レトロ風の枠付きウィンドウ
│   ├── PixelLogo.tsx       # ドット絵ロゴ
│   └── ...
├── lib/                    # コアロジック
│   ├── tmux.ts             # tmux セッション管理
│   ├── config.ts           # 設定ファイル管理
│   ├── cli-registry.ts     # AI CLI レジストリ
│   ├── quick-commands.ts   # Quick Command ローダー
│   ├── ansi.ts             # ANSI エスケープシーケンスパーサー
│   ├── mailbox.ts          # エージェント間メッセージング
│   ├── tasks.ts            # タスク管理
│   ├── worktrees.ts        # Worker ごとの git worktree
│   ├── checks.ts           # 確認コマンドの実行
│   ├── report.ts           # 完了レポート
│   ├── theme.ts            # テーマと見た目
│   ├── progress.ts         # パーティの進み具合（XP・ゴールド・装備）
│   ├── adventure.ts        # スキルとダンジョン
│   ├── gear.ts             # 装備のドロップと効果
│   ├── monsters.ts         # クエストのモンスター
│   ├── titles.ts           # 称号
│   ├── skill-usage.ts      # 会話履歴からのスキル使用回数
│   ├── rpg-messages.ts     # ぼうけんのメッセージ
│   └── ...
instructions/               # エージェントロール別指示ファイル
```

## License

[MIT](LICENSE)
