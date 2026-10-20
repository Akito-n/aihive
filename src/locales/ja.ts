import type { TransKey } from "./en.js";

export const ja: Record<TransKey, string> = {
  // ─── Common ─────────────────────────────────────────────────────
  "common.select": "選択",
  "common.confirm": "決定",
  "common.back": "戻る",
  "common.cancel": "キャンセル",
  "common.save": "保存",
  "common.error": "エラー",
  "common.loading": "読み込み中...",

  // ─── Main Menu ──────────────────────────────────────────────────
  "mainMenu.tagline": "⬡  マルチエージェント オーケストレーション  ⬡",
  "mainMenu.startAgents": "エージェント起動",
  "mainMenu.startAgents.desc": "全エージェントをtmuxで起動",
  "mainMenu.settings": "設定",
  "mainMenu.settings.desc": "ワーカーやオプションを設定",
  "mainMenu.quit": "終了",
  "mainMenu.quit.desc": "aihiveを終了",

  // ─── Settings ───────────────────────────────────────────────────
  "settings.title": "設定",
  "settings.agentNames": "エージェント名",
  "settings.agentNames.desc": "エージェント名とロールを編集",
  "settings.quickCommands": "クイックコマンド",
  "settings.quickCommands.desc": "// コマンドを編集",
  "settings.character": "キャラクター",
  "settings.character.desc": "RPGキャラクターステータスを表示",
  "settings.language": "言語",
  "settings.language.desc": "表示言語を切り替え",
  "settings.back": "戻る",
  "settings.back.desc": "メインメニューに戻る",

  // ─── Language ───────────────────────────────────────────────────
  "language.title": "言語設定",
  "language.en": "English",
  "language.ja": "日本語",
  "language.current": "(現在)",

  // ─── Character ──────────────────────────────────────────────────
  "character.loading": "キャラクターデータを読み込み中...",
  "character.notFound": "キャラクターが見つかりません",
  "character.title": "キャラクターステータス",
  "character.name": "名前:",
  "character.job": "職業:",
  "character.level": "レベル:",
  "character.xp": "経験値:",
  "character.selectJob": "職業を選択",
  "character.changeJob": "職業変更",
  "character.battleStats": "バトルステータス",
  "character.skillXp": "スキル経験値",
  "character.recentEvaluations": "最近の評価",
  "character.noEvaluations": "まだ評価がありません。実行: aihive --evaluate",

  // ─── Skill Names ───────────────────────────────────────────────
  "skill.articulation": "伝達力",
  "skill.comprehension": "理解力",
  "skill.review": "検証力",
  "skill.collaboration": "協調力",
  "skill.inquiry": "探究力",
  "skill.articulation.short": "伝",
  "skill.comprehension.short": "理",
  "skill.review.short": "検",
  "skill.collaboration.short": "協",
  "skill.inquiry.short": "探",

  // ─── Header ─────────────────────────────────────────────────────
  "header.agents": "エージェント",
  "header.tasks": "タスク",
  "header.skills": "スキル",
  "header.memory": "メモリ",
  "header.session": "セッション",

  // ─── Status ─────────────────────────────────────────────────────
  "status.idle": "待機中",
  "status.settings": "設定中",
  "status.starting": "起動中",
  "status.running": "実行中",
  "status.stopping": "停止中",

  // ─── Log View ──────────────────────────────────────────────────
  "log.entries": "件",
  "log.close": "で閉じる",
  "log.noEvents": "イベントはまだありません",

  // ─── Help Bar ───────────────────────────────────────────────────
  "help.start": "開始",
  "help.select": "選択",
  "help.sendCommand": "コマンド送信",
  "help.overview": "概要",
  "help.log": "ログ",
  "help.stop": "停止",
  "help.quit": "終了",

  // ─── Startup ────────────────────────────────────────────────────
  "startup.checkDeps": "依存関係を確認中...",
  "startup.createSession": "tmuxセッションを作成中...",
  "startup.spawnOrchestrator": "Orchestratorを起動中...",
  "startup.spawnCoordinator": "Coordinatorを起動中...",
  "startup.spawnWorkers": "Workerを起動中...",
  "startup.allReady": "全エージェント準備完了。",

  // ─── Agent Editor ───────────────────────────────────────────────
  "agentEditor.title": "エージェント設定",
  "agentEditor.instructions": "↑↓←→ 移動 | Enter 編集 | d 削除 | Esc 戻る",
  "agentEditor.addAgent": "+ エージェント追加",
  "agentEditor.saveBack": "保存して戻る",
  "agentEditor.fieldName": "名前",
  "agentEditor.fieldRole": "ロール",
  "agentEditor.fieldCli": "CLI",
  "agentEditor.fieldModel": "モデル",

  // ─── Command Input ──────────────────────────────────────────────
  "commandInput.placeholder": "メッセージを入力...",
  "commandInput.commands": "コマンド",
  "commandInput.actionRequired": "⚡ アクションが必要:",
  "commandInput.pressKey": "キーを押して応答 (入力欄が空の状態で)",

  // ─── Agent-facing text (typed into panes or written for agents) ──
  "agentMsg.inboxNudge":
    "[inbox: {count}件の新着 from {from}] {dir}/ を確認してください",
  "agentMsg.stallReminder":
    "[aihive] タスク {id} が {minutes}分間更新されていません。{dir}/ と {dir}/{processed}/ を確認して作業を続けてください。終わっていれば result、進められなければ error を送ってください",
  "skillsIndex.title": "# 承認済みスキル",
  "skillsIndex.intro":
    "このファイルは aihive が自動生成します。編集しないでください。\n作業内容が「適用条件」に当てはまるスキルがあれば、その手順に従ってください。",
  "skillsIndex.empty": "承認済みスキルはまだありません。",
  "skillsIndex.trigger": "- 適用条件: {trigger}",
  "skillsIndex.proposedBy": "- 提案: {by}",
  "skillsIndex.approvedBy": " / 承認: {by}",
  "skillsIndex.steps": "### 手順",
  "worktree.prompt": `## あなたの作業場所（aihive が自動で設定）

- 作業フォルダ: \`{worktreeDir}\`（ここでファイルを編集する）
- あなたのブランチ: \`{branch}\`
- 統合ブランチ: \`{integrationBranch}\`（プロジェクト本体 \`{projectDir}\` でチェックアウトされているブランチ）
- この指示書に出てくる \`.aihive/\` から始まるパス（メールボックス、スキル、メモリ）は、すべて \`{projectDir}/.aihive/\` を指します。作業フォルダ内の \`.aihive/\` ではありません

### git の流れ

1. **タスク開始時**: \`git merge {integrationBranch}\` で最新の統合結果を取り込む。衝突したら解消し、できなければ \`error\` で報告する
2. **完了前**: 確認コマンドを実行して成功させる
3. **完了時**: 変更したファイルを \`git add <ファイル>\` で指定してコミットする（\`git add -A\` は使わない。\`node_modules\` はコミットしない）
4. **完了報告**: \`result\` の payload にブランチ名、作業フォルダ、コミットのハッシュ（\`git rev-parse --short HEAD\`）を含める

- 自分のブランチ以外へのコミット、\`git push\`、ブランチの切り替え、作業フォルダの外のファイル編集はしない（\`.aihive/\` のメールボックスへの書き込みは除く）
- 統合ブランチへのマージは Reviewer が行う`,
  "xp.scoreLine": "    → +{xp} XP (伝:{a} 理:{c} 検:{r} 協:{co} 探:{i})",
};
