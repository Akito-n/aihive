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
};
