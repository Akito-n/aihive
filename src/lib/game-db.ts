// ─── Game Database (sql.js / SQLite WASM) ─────────────────────────────
// Manages character data and evaluation history in ~/.aihive/game.db

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import initSqlJs, { type Database } from "sql.js";

const AIHIVE_DIR = join(homedir(), ".aihive");
const DB_PATH = join(AIHIVE_DIR, "game.db");

// ─── Types ───────────────────────────────────────────────────────────

export type JobType = "warrior" | "mage" | "scout" | "sage";

export interface JobDefinition {
  key: JobType;
  name: string;
  description: string;
  icon: string;
  /** Weight matrix: how each XP category contributes to battle stats */
  weights: {
    hp:  [number, number, number, number, number]; // [art, comp, rev, collab, inq]
    mp:  [number, number, number, number, number];
    str: [number, number, number, number, number];
    int: [number, number, number, number, number];
    dex: [number, number, number, number, number];
  };
}

export const JOBS: Record<JobType, JobDefinition> = {
  warrior: {
    key: "warrior",
    name: "Warrior",
    description: "Clear instructions, strong execution",
    icon: "⚔",
    weights: {
      hp:  [0.30, 0.10, 0.10, 0.30, 0.20],
      mp:  [0.10, 0.30, 0.10, 0.10, 0.40],
      str: [0.50, 0.10, 0.10, 0.20, 0.10],
      int: [0.10, 0.20, 0.10, 0.10, 0.50],
      dex: [0.10, 0.10, 0.50, 0.20, 0.10],
    },
  },
  mage: {
    key: "mage",
    name: "Mage",
    description: "Deep inquiry, knowledge seeker",
    icon: "🔮",
    weights: {
      hp:  [0.10, 0.30, 0.10, 0.30, 0.20],
      mp:  [0.10, 0.10, 0.10, 0.20, 0.50],
      str: [0.40, 0.10, 0.10, 0.20, 0.20],
      int: [0.05, 0.20, 0.10, 0.10, 0.55],
      dex: [0.10, 0.15, 0.45, 0.15, 0.15],
    },
  },
  scout: {
    key: "scout",
    name: "Scout",
    description: "Sharp reviewer, bug hunter",
    icon: "🗡",
    weights: {
      hp:  [0.15, 0.10, 0.25, 0.30, 0.20],
      mp:  [0.10, 0.30, 0.10, 0.10, 0.40],
      str: [0.35, 0.10, 0.20, 0.20, 0.15],
      int: [0.10, 0.20, 0.15, 0.10, 0.45],
      dex: [0.05, 0.10, 0.55, 0.15, 0.15],
    },
  },
  sage: {
    key: "sage",
    name: "Sage",
    description: "Balanced, constructive collaborator",
    icon: "📖",
    weights: {
      hp:  [0.20, 0.20, 0.15, 0.25, 0.20],
      mp:  [0.15, 0.20, 0.10, 0.25, 0.30],
      str: [0.30, 0.15, 0.15, 0.20, 0.20],
      int: [0.15, 0.20, 0.15, 0.15, 0.35],
      dex: [0.15, 0.15, 0.35, 0.20, 0.15],
    },
  },
};

export const JOB_KEYS: JobType[] = ["warrior", "mage", "scout", "sage"];

export interface BattleStats {
  hp: number;
  mp: number;
  str: number;
  int: number;
  dex: number;
}

export interface Character {
  id: number;
  name: string;
  job: JobType;
  level: number;
  totalXp: number;
  statArticulation: number;
  statComprehension: number;
  statReview: number;
  statCollaboration: number;
  statInquiry: number;
  createdAt: string;
  updatedAt: string;
}

export interface XpScores {
  articulation: number;
  comprehension: number;
  review: number;
  collaboration: number;
  inquiry: number;
}

export interface EvaluationRecord {
  id: number;
  filePath: string;
  sessionId: string;
  evaluatedAt: string;
  xpArticulation: number;
  xpComprehension: number;
  xpReview: number;
  xpCollaboration: number;
  xpInquiry: number;
  xpTotal: number;
}

// ─── Level Calculation ───────────────────────────────────────────────

const LEVEL_CONSTANT = 200;

/** level = floor(sqrt(total_xp / LEVEL_CONSTANT)) + 1 */
export function calculateLevel(totalXp: number): number {
  return Math.floor(Math.sqrt(totalXp / LEVEL_CONSTANT)) + 1;
}

/** XP required to reach a given level */
export function xpForLevel(level: number): number {
  return (level - 1) * (level - 1) * LEVEL_CONSTANT;
}

/** Calculate battle stats from raw XP categories using job weights */
export function calculateBattleStats(character: Character): BattleStats {
  const job = JOBS[character.job] ?? JOBS.sage;
  const raw = [
    character.statArticulation,
    character.statComprehension,
    character.statReview,
    character.statCollaboration,
    character.statInquiry,
  ];

  function weighted(weights: number[]): number {
    let sum = 0;
    for (let i = 0; i < 5; i++) {
      sum += raw[i] * weights[i];
    }
    return Math.floor(sum / 10) + 10; // base 10 + weighted contribution
  }

  return {
    hp: weighted(job.weights.hp),
    mp: weighted(job.weights.mp),
    str: weighted(job.weights.str),
    int: weighted(job.weights.int),
    dex: weighted(job.weights.dex),
  };
}

// ─── Database ────────────────────────────────────────────────────────

let db: Database | null = null;

const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS character (
  id INTEGER PRIMARY KEY DEFAULT 1,
  name TEXT NOT NULL DEFAULT 'Adventurer',
  job TEXT NOT NULL DEFAULT 'sage',
  level INTEGER NOT NULL DEFAULT 1,
  total_xp INTEGER NOT NULL DEFAULT 0,
  stat_articulation INTEGER NOT NULL DEFAULT 0,
  stat_comprehension INTEGER NOT NULL DEFAULT 0,
  stat_review INTEGER NOT NULL DEFAULT 0,
  stat_collaboration INTEGER NOT NULL DEFAULT 0,
  stat_inquiry INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evaluated_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  session_id TEXT NOT NULL,
  evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
  xp_articulation INTEGER NOT NULL DEFAULT 0,
  xp_comprehension INTEGER NOT NULL DEFAULT 0,
  xp_review INTEGER NOT NULL DEFAULT 0,
  xp_collaboration INTEGER NOT NULL DEFAULT 0,
  xp_inquiry INTEGER NOT NULL DEFAULT 0,
  xp_total INTEGER NOT NULL DEFAULT 0,
  UNIQUE(file_path, session_id)
);
`;

export async function initGameDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();

  mkdirSync(AIHIVE_DIR, { recursive: true });

  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(CREATE_TABLES);

  // Migrate: add job column if missing (existing DBs before job system)
  const tableInfo = db.exec("PRAGMA table_info(character)");
  if (tableInfo.length > 0) {
    const colNames = tableInfo[0].values.map((row) => row[1] as string);
    if (!colNames.includes("job")) {
      db.run("ALTER TABLE character ADD COLUMN job TEXT NOT NULL DEFAULT 'sage'");
    }
  }

  // Ensure default character row exists
  const existing = db.exec("SELECT id FROM character WHERE id = 1");
  if (existing.length === 0 || existing[0].values.length === 0) {
    db.run("INSERT INTO character (id) VALUES (1)");
  }

  saveDb();
  return db;
}

export function getDb(): Database {
  if (!db) throw new Error("Game database not initialized. Call initGameDb() first.");
  return db;
}

export function saveDb(): void {
  if (!db) return;
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

// ─── Character Operations ────────────────────────────────────────────

export function getCharacter(): Character {
  const d = getDb();
  const result = d.exec("SELECT * FROM character WHERE id = 1");
  if (result.length === 0 || result[0].values.length === 0) {
    throw new Error("Character not found");
  }

  const cols = result[0].columns;
  const vals = result[0].values[0];
  const row: Record<string, unknown> = {};
  for (let i = 0; i < cols.length; i++) {
    row[cols[i]] = vals[i];
  }

  return {
    id: row["id"] as number,
    name: row["name"] as string,
    job: (row.job as JobType) ?? "sage",
    level: row["level"] as number,
    totalXp: row["total_xp"] as number,
    statArticulation: row["stat_articulation"] as number,
    statComprehension: row["stat_comprehension"] as number,
    statReview: row["stat_review"] as number,
    statCollaboration: row["stat_collaboration"] as number,
    statInquiry: row["stat_inquiry"] as number,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

export function updateCharacterName(name: string): void {
  const d = getDb();
  d.run("UPDATE character SET name = ?, updated_at = datetime('now') WHERE id = 1", [name]);
  saveDb();
}

export function updateCharacterJob(job: JobType): void {
  const d = getDb();
  d.run("UPDATE character SET job = ?, updated_at = datetime('now') WHERE id = 1", [job]);
  saveDb();
}

export function addXp(scores: XpScores): Character {
  const d = getDb();
  const totalGained =
    scores.articulation + scores.comprehension + scores.review +
    scores.collaboration + scores.inquiry;

  d.run(
    `UPDATE character SET
      total_xp = total_xp + ?,
      stat_articulation = stat_articulation + ?,
      stat_comprehension = stat_comprehension + ?,
      stat_review = stat_review + ?,
      stat_collaboration = stat_collaboration + ?,
      stat_inquiry = stat_inquiry + ?,
      updated_at = datetime('now')
    WHERE id = 1`,
    [
      totalGained,
      scores.articulation,
      scores.comprehension,
      scores.review,
      scores.collaboration,
      scores.inquiry,
    ],
  );

  // Recalculate level
  const char = getCharacter();
  const newLevel = calculateLevel(char.totalXp);
  if (newLevel !== char.level) {
    d.run("UPDATE character SET level = ? WHERE id = 1", [newLevel]);
  }

  saveDb();
  return getCharacter();
}

// ─── Evaluation History ──────────────────────────────────────────────

export function isSessionEvaluated(filePath: string, sessionId: string): boolean {
  const d = getDb();
  const result = d.exec(
    "SELECT id FROM evaluated_session WHERE file_path = ? AND session_id = ?",
    [filePath, sessionId],
  );
  return result.length > 0 && result[0].values.length > 0;
}

export function markSessionEvaluated(
  filePath: string,
  sessionId: string,
  scores: XpScores,
): void {
  const d = getDb();
  const total =
    scores.articulation + scores.comprehension + scores.review +
    scores.collaboration + scores.inquiry;

  d.run(
    `INSERT INTO evaluated_session
      (file_path, session_id, xp_articulation, xp_comprehension, xp_review, xp_collaboration, xp_inquiry, xp_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      filePath,
      sessionId,
      scores.articulation,
      scores.comprehension,
      scores.review,
      scores.collaboration,
      scores.inquiry,
      total,
    ],
  );
  saveDb();
}

export function getEvaluationHistory(limit: number = 10): EvaluationRecord[] {
  const d = getDb();
  const result = d.exec(
    `SELECT * FROM evaluated_session ORDER BY evaluated_at DESC LIMIT ?`,
    [limit],
  );

  if (result.length === 0) return [];

  const cols = result[0].columns;
  return result[0].values.map((vals) => {
    const row: Record<string, unknown> = {};
    for (let i = 0; i < cols.length; i++) {
      row[cols[i]] = vals[i];
    }
    return {
      id: row["id"] as number,
      filePath: row["file_path"] as string,
      sessionId: row["session_id"] as string,
      evaluatedAt: row["evaluated_at"] as string,
      xpArticulation: row["xp_articulation"] as number,
      xpComprehension: row["xp_comprehension"] as number,
      xpReview: row["xp_review"] as number,
      xpCollaboration: row["xp_collaboration"] as number,
      xpInquiry: row["xp_inquiry"] as number,
      xpTotal: row["xp_total"] as number,
    };
  });
}
