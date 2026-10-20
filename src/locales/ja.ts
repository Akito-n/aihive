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
  "log.filter.all": "すべて",
  "log.filter.message": "メッセージ",
  "log.filter.task": "タスク・確認",
  "log.filter.warning": "警告",
  "log.scrolled": "（最新から {count} 行上）",
  "log.help":
    "[j/k・PgUp/PgDn] スクロール  [g/G] 最初/最新  [f] 絞り込み  [Esc/L] 戻る",

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
  "dashboard.agents": "エージェント",
  "dashboard.noTask": "待機中",
  "dashboard.tasks": "タスク",
  "dashboard.stalled": "停滞 {count}",
  "dashboard.more": "ほか {count} 件（T で一覧）",
  "dashboard.skills": "スキル",
  "dashboard.skillsApproved": "承認済み {count}",
  "dashboard.skillsPending": "承認待ち {count}",
  "dashboard.memory": "メモリ",
  "dashboard.memoryEntries": "{count} 件",
  "taskView.title": "タスク",
  "taskView.filter.all": "すべて",
  "taskView.filter.open": "未完了",
  "taskView.filter.done": "完了",
  "taskView.filter.error": "失敗",
  "taskView.count": "{shown} / {total} 件",
  "taskView.empty": "表示するタスクはありません",
  "taskView.stalled": "停滞",
  "taskView.assignee": "担当: {name}",
  "taskView.blockedBy": "待っているタスク: {ids}",
  "taskView.times": "作成 {created} / 更新 {updated}（{duration}）",
  "taskView.checksPassed": "確認コマンド: 成功（コミット {commit}）",
  "taskView.checksFailed": "確認コマンド: 失敗（{command}）",
  "taskView.request": "依頼",
  "taskView.result": "結果",
  "taskView.none": "（まだありません）",
  "taskView.scroll": "── {from}-{to} / {total} 行 [J/K] ──",
  "taskView.help":
    "[j/k] 選択  [J/K・PgUp/PgDn] 詳細をスクロール  [f] 絞り込み  [Esc/T] 戻る",
  "taskState.pending": "待機中",
  "taskState.blocked": "依存待ち",
  "taskState.running": "作業中",
  "taskState.review": "レビュー中",
  "taskState.done": "完了",
  "taskState.error": "失敗",
  "help.tasks": "タスク",
  "notify.allDone":
    "すべてのタスクが終わりました（完了 {done} / 失敗 {failed}）",
  "notify.stalled": "タスク {ids} が {minutes}分間止まっています",
  "notify.checksFailed":
    "{worker} の {task} で確認コマンドが失敗しました: {command}",
  "report.title": "# aihive 完了レポート",
  "report.created": "- 作成: {time}",
  "report.summary": "- タスク: {total} 件（完了 {done} / 失敗 {failed}）",
  "report.elapsed": "- 全体の時間: {duration}",
  "report.state": "- 状態: {state}",
  "report.done": "完了",
  "report.failed": "失敗",
  "report.assignee": "- 最後の担当: {name}",
  "report.duration": "- 所要時間: {duration}",
  "report.checksPassed": "- 確認コマンド: 成功（コミット {commit}）",
  "report.checksFailed": "- 確認コマンド: 失敗（{command}）",
  "report.result": "- 結果:",
  "report.moreLines": "…ほか {count} 行",
  "report.underMinute": "1分未満",
  "report.minutes": "{m}分",
  "report.hoursMinutes": "{h}時間{m}分",
  "xp.scoreLine": "    → +{xp} XP (伝:{a} 理:{c} 検:{r} 協:{co} 探:{i})",

  // ─── Retro theme ────────────────────────────────────────────────
  "settings.theme": "テーマ",
  "settings.theme.desc": "画面の見た目を切り替え",
  "theme.title": "テーマ",
  "theme.retro": "レトロRPG",
  "theme.classic": "クラシック",
  "job.orchestrator": "おうさま",
  "job.coordinator": "けんじゃ",
  "job.worker": "せんし",
  "job.reviewer": "そうりょ",
  "job.scout": "とうぞく",
  "condition.pending": "たいき",
  "condition.running": "たたかい中",
  "condition.done": "ひとやすみ",
  "condition.error": "こんらん",
  "condition.stalled": "どく",
  "retro.party": "なかま",
  "retro.quests": "クエスト",
  "retro.bag": "ふくろ",
  "retro.poisoned": "どく {count}",
  "retro.paneTitle": "{name} の ようす",
  "retro.commands": "コマンド",
  "retro.cmd.start": "ぼうけんに でる",
  "retro.cmd.select": "えらぶ",
  "retro.cmd.talk": "はなす",
  "retro.cmd.quests": "クエスト",
  "retro.cmd.overview": "ぜんたい",
  "retro.cmd.log": "きろく",
  "retro.cmd.stop": "にげる",
  "retro.cmd.quit": "おわる",
};
