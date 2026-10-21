import { Box, Text } from "ink";
import { t, tf } from "../lib/i18n.js";
import { toSlug } from "../lib/mailbox.js";
import { modelName } from "../lib/model-resolver.js";
import { bossHp, questMonsterOf } from "../lib/monsters.js";
import { formatDuration } from "../lib/report.js";
import type { RpgMessage } from "../lib/rpg-messages.js";
import type { Task, TaskState } from "../lib/tasks.js";
import {
  conditionOf,
  cursorGlyph,
  gaugeFill,
  isRetro,
  jobKeyOf,
} from "../lib/theme.js";
import type { AgentInfo } from "../lib/tmux.js";
import type { TransKey } from "../locales/en.js";
import { useBlink, Window } from "./Window.js";

interface SkillCounts {
  proposed: number;
  approved: number;
  rejected: number;
}

interface DashboardProps {
  agents: AgentInfo[];
  selectedIndex: number;
  tasks?: Task[];
  stalledIds?: string[]; // tasks with no update for a while
  skillCounts?: SkillCounts;
  memoryCount?: number;
  now?: number; // for elapsed times; defaults to the render time
  /** Lasting levels by agent name (retro look); 1 when missing */
  levels?: Record<string, number>;
  /** Rows the retro column may use; everything shows when missing */
  height?: number;
  /** Which tab shows under the party (retro look) */
  tab?: DashTab;
  /** Story lines for the adventure tab, newest first */
  journal?: JournalEntry[];
  floor?: number;
  gold?: number;
}

const STATUS_ICON: Record<AgentInfo["status"], string> = {
  pending: "●",
  running: "●",
  done: "●",
  error: "●",
};

const STATUS_COLOR: Record<AgentInfo["status"], string> = {
  pending: "gray",
  running: "yellow",
  done: "green",
  error: "red",
};

const ROLE_ICON: Record<string, string> = {
  orchestrator: "👑",
  coordinator: "🔗",
  worker: "🔨",
  reviewer: "🔍",
  scout: "🐝",
};

const ROLE_COLOR: Record<string, string> = {
  orchestrator: "magenta",
  coordinator: "blue",
  worker: "yellow",
  reviewer: "green",
  scout: "cyan",
};

const TASK_ICON: Record<TaskState, string> = {
  pending: "○",
  blocked: "⊘",
  running: "●",
  review: "◉",
  done: "✓",
  error: "✗",
};

/** Marks a task with no update for a while */
const STALLED_ICON = "⏱";

const STATE_LABEL: Record<TaskState, TransKey> = {
  pending: "taskState.pending",
  blocked: "taskState.blocked",
  running: "taskState.running",
  review: "taskState.review",
  done: "taskState.done",
  error: "taskState.error",
};

/** States in which a task is in an agent's hands */
const ACTIVE_STATES = new Set<TaskState>(["pending", "running", "review"]);

/** The task an agent is working on now: its most recently updated active one */
export function currentTaskOf(
  agent: AgentInfo,
  tasks: Task[],
): Task | undefined {
  const slug = toSlug(agent.name);
  return tasks
    .filter((t) => ACTIVE_STATES.has(t.state) && toSlug(t.assignedTo) === slug)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

/** How many tasks to list under the counts */
const TASK_LIST_LIMIT = 6;

/** Stalled tasks first, then other unfinished ones, then the most recently updated */
export function tasksToList(
  tasks: Task[],
  limit = TASK_LIST_LIMIT,
  stalledIds: string[] = [],
): Task[] {
  const finished = (t: Task) => t.state === "done";
  const stalled = (t: Task) => stalledIds.includes(t.id);
  return [...tasks]
    .sort(
      (a, b) =>
        Number(finished(a)) - Number(finished(b)) ||
        Number(stalled(b)) - Number(stalled(a)) ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
    .slice(0, limit);
}

const TASK_COLOR: Record<TaskState, string> = {
  pending: "gray",
  blocked: "magenta",
  running: "yellow",
  review: "cyan",
  done: "green",
  error: "red",
};

export function Dashboard(props: DashboardProps) {
  return isRetro() ? (
    <RetroDashboard {...props} />
  ) : (
    <ClassicDashboard {...props} />
  );
}

/** A boss's HP: the subtasks still open, as a small bar */
function BossHp({ hp }: { hp?: { left: number; total: number } }) {
  if (!hp) return null;
  const width = 5;
  const filled = Math.ceil((hp.left / hp.total) * width);
  return (
    <Text color={hp.left === 0 ? "gray" : "red"}>
      {gaugeFill().repeat(filled)}
      {"░".repeat(width - filled)} {hp.left}/{hp.total}
    </Text>
  );
}

/** Columns a string takes in a terminal: wide (CJK) characters take two */
export function cellWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    width += wide ? 2 : 1;
  }
  return width;
}

/** A story line kept for the adventure tab */
export interface JournalEntry extends RpgMessage {
  id: number;
}

/** Tabs under the party in the retro look, switched with Tab */
export type DashTab = "quests" | "adventure" | "bag";
export const DASH_TABS: DashTab[] = ["quests", "adventure", "bag"];

const TAB_LABEL: Record<DashTab, TransKey> = {
  quests: "retro.quests",
  adventure: "retro.adventure",
  bag: "retro.bag",
};

/** Fewest rows worth giving the tab window: its tab bar, frame and one line */
const MIN_TAB_ROWS = 4;

/**
 * How the retro left column fits its height. The party always shows; a
 * second line per busy member shows only when the tab window still fits.
 */
export function fitLeftColumn(
  height: number | undefined,
  members: number,
  busy: number,
): { details: boolean; tabLines: number } {
  if (height === undefined) return { details: true, tabLines: TASK_LIST_LIMIT };
  const rest = height - (members + 2);
  const details = busy > 0 && rest - busy >= MIN_TAB_ROWS;
  const left = rest - (details ? busy : 0);
  return { details, tabLines: left >= MIN_TAB_ROWS ? left - 3 : 0 };
}

export interface MemberState {
  kind: "idle" | "busy" | "review" | "stalled" | "error";
  /** Short text after the level, such as "⚔T1-2" */
  text: string;
  color: string;
}

const MEMBER_ICON: Record<MemberState["kind"], string> = {
  idle: "·",
  busy: "⚔",
  review: "✚",
  stalled: "☠",
  error: "✗",
};

const MEMBER_COLOR: Record<MemberState["kind"], string> = {
  idle: "gray",
  busy: "yellow",
  review: "cyan",
  stalled: "magenta",
  error: "red",
};

/** What a member is doing, from its tasks: idle members are not fighting */
export function memberStateOf(
  agent: AgentInfo,
  current: Task | undefined,
  stalled: boolean,
): MemberState {
  const kind: MemberState["kind"] =
    agent.status === "error"
      ? "error"
      : !current
        ? "idle"
        : stalled
          ? "stalled"
          : current.state === "review"
            ? "review"
            : "busy";
  const text =
    current && kind !== "error"
      ? `${MEMBER_ICON[kind]}${current.id}`
      : `${MEMBER_ICON[kind]}${t(conditionOf(kind === "error" ? "error" : "pending", false).key)}`;
  return { kind, text, color: MEMBER_COLOR[kind] };
}

interface HudProps {
  agents: AgentInfo[];
  tasks: Task[];
  stalledIds: string[];
}

/** A one-line summary for a window's bottom border: members by state, quests done */
export function PartyHud({ agents, tasks, stalledIds }: HudProps) {
  const counts: Record<MemberState["kind"], number> = {
    busy: 0,
    stalled: 0,
    review: 0,
    idle: 0,
    error: 0,
  };
  for (const agent of agents) {
    const current = currentTaskOf(agent, tasks);
    const stalled = Boolean(current && stalledIds.includes(current.id));
    counts[memberStateOf(agent, current, stalled).kind]++;
  }
  const done = tasks.filter((task) => task.state === "done").length;
  const width = 6;
  const filled = tasks.length ? Math.round((done / tasks.length) * width) : 0;
  return (
    <Text>
      {(Object.keys(counts) as MemberState["kind"][])
        .filter((kind) => counts[kind] > 0)
        .map((kind) => (
          <Text key={kind} color={MEMBER_COLOR[kind]}>
            {` ${MEMBER_ICON[kind]}${counts[kind]}`}
          </Text>
        ))}
      <Text dimColor> │ Q </Text>
      <Text color="green">{gaugeFill().repeat(filled)}</Text>
      <Text dimColor>{"░".repeat(width - filled)}</Text>
      <Text>{` ${done}/${tasks.length} `}</Text>
    </Text>
  );
}

function RetroDashboard({
  agents,
  selectedIndex,
  tasks = [],
  stalledIds = [],
  skillCounts,
  memoryCount = 0,
  now = Date.now(),
  levels = {},
  height,
  tab = "quests",
  journal = [],
  floor = 1,
  gold = 0,
}: DashboardProps) {
  const blink = useBlink();
  const members = agents.map((agent) => {
    const current = currentTaskOf(agent, tasks);
    const stalled = Boolean(current && stalledIds.includes(current.id));
    return {
      agent,
      current,
      stalled,
      state: memberStateOf(agent, current, stalled),
    };
  });
  const busy = members.filter((m) => m.current).length;
  const { details, tabLines } = fitLeftColumn(height, agents.length, busy);
  // Too short for everyone: show the rows around the selected member
  const rows = height === undefined ? members.length : Math.max(1, height - 2);
  const first = Math.min(
    Math.max(0, selectedIndex - rows + 1),
    Math.max(0, members.length - rows),
  );
  const jobs = members.map(({ agent }) => {
    const jobKey = jobKeyOf(agent.role);
    return jobKey ? t(jobKey) : agent.role;
  });
  const jobWidth = Math.max(...jobs.map(cellWidth), 0);
  const stateWidth = Math.max(
    ...members.map((m) => cellWidth(m.state.text)),
    0,
  );
  return (
    <Box flexDirection="column">
      <Window title={t("retro.party")}>
        {members.slice(first, first + rows).map((member, n) => {
          const { agent, current, stalled, state } = member;
          const i = first + n;
          const isSelected = i === selectedIndex;
          return (
            <Box key={agent.name} flexDirection="column" flexShrink={0}>
              <Box>
                <Text bold>{isSelected && blink ? cursorGlyph() : " "}</Text>
                <Box flexGrow={1} flexShrink={1}>
                  <Text bold={isSelected} wrap="truncate-end">
                    {agent.name}
                  </Text>
                </Box>
                {/* Only the name gives way when the column is narrow */}
                <Box flexShrink={0} marginLeft={1} width={jobWidth}>
                  <Text dimColor>{jobs[i]}</Text>
                </Box>
                <Box flexShrink={0}>
                  <Text> Lv{levels[agent.name] ?? 1} </Text>
                </Box>
                <Box flexShrink={0} width={stateWidth}>
                  <Text color={state.color}>{state.text}</Text>
                </Box>
              </Box>
              {details && current && (
                <Box marginLeft={2}>
                  <Text
                    wrap="truncate-end"
                    dimColor={!stalled}
                    color={stalled ? "magenta" : undefined}
                  >
                    └ {formatDuration(now - Date.parse(current.updatedAt))}{" "}
                    {current.description}
                  </Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Window>

      {tabLines > 0 && (
        <>
          <Box gap={1}>
            {DASH_TABS.map((name) =>
              name === tab ? (
                <Text key={name} bold>
                  [{t(TAB_LABEL[name])}]
                </Text>
              ) : (
                <Text key={name} dimColor>
                  {` ${t(TAB_LABEL[name])} `}
                </Text>
              ),
            )}
            <Text dimColor>Tab</Text>
          </Box>
          <Window
            title={t(TAB_LABEL[tab])}
            // Fill the column only when it has a set height
            height={height === undefined ? undefined : tabLines + 2}
            overflow="hidden"
          >
            {tab === "quests" && (
              <QuestTab
                tasks={tasks}
                stalledIds={stalledIds}
                lines={tabLines}
              />
            )}
            {tab === "adventure" && (
              <AdventureTab
                journal={journal}
                floor={floor}
                gold={gold}
                lines={tabLines}
              />
            )}
            {tab === "bag" && (
              <BagTab skillCounts={skillCounts} memoryCount={memoryCount} />
            )}
          </Window>
        </>
      )}
    </Box>
  );
}

function QuestTab({
  tasks,
  stalledIds,
  lines,
}: {
  tasks: Task[];
  stalledIds: string[];
  lines: number;
}) {
  if (tasks.length === 0) {
    return <Text dimColor>{t("retro.noQuests")}</Text>;
  }
  const counts: Partial<Record<TaskState, number>> = {};
  for (const task of tasks) {
    counts[task.state] = (counts[task.state] ?? 0) + 1;
  }
  // One line for the counts; keep one for "+N more" when some are left out
  const room = Math.max(1, lines - 1);
  const limit = tasks.length > room ? room - 1 : room;
  return (
    <>
      <Box columnGap={2} height={1} overflow="hidden">
        {(Object.entries(counts) as [TaskState, number][]).map(
          ([state, count]) => (
            <Box key={state} flexShrink={0}>
              <Text color={TASK_COLOR[state]}>
                {TASK_ICON[state]} {count}
              </Text>
            </Box>
          ),
        )}
        {stalledIds.length > 0 && (
          <Box flexShrink={0}>
            <Text color="magenta" bold>
              {tf("retro.poisoned", { count: stalledIds.length })}
            </Text>
          </Box>
        )}
      </Box>
      {tasksToList(tasks, limit, stalledIds).map((task) => (
        <Box key={task.id} gap={1}>
          <Text
            color={
              stalledIds.includes(task.id) ? "magenta" : TASK_COLOR[task.state]
            }
          >
            {TASK_ICON[task.state]}
          </Text>
          <Text wrap="truncate-end">{task.id}</Text>
          <Box flexGrow={1} flexShrink={1}>
            <Text dimColor wrap="truncate-end">
              {t(questMonsterOf(task))}
            </Text>
          </Box>
          <BossHp hp={bossHp(task, tasks)} />
        </Box>
      ))}
      {tasks.length > limit && (
        <Text dimColor wrap="truncate-end">
          {tf("dashboard.more", { count: tasks.length - limit })}
        </Text>
      )}
    </>
  );
}

function AdventureTab({
  journal,
  floor,
  gold,
  lines,
}: {
  journal: JournalEntry[];
  floor: number;
  gold: number;
  lines: number;
}) {
  return (
    <>
      <Text wrap="truncate-end">
        <Text color="yellow">{tf("retro.hudFloor", { floor })}</Text>
        <Text color="yellow"> {gold}G</Text>
      </Text>
      {journal.length === 0 ? (
        <Text dimColor wrap="truncate-end">
          {t("retro.noAdventure")}
        </Text>
      ) : (
        journal.slice(0, Math.max(0, lines - 1)).map((entry, i) => (
          <Text
            key={entry.id}
            color={entry.color}
            dimColor={i > 0 && !entry.color}
            wrap="truncate-end"
          >
            {entry.text}
          </Text>
        ))
      )}
    </>
  );
}

function BagTab({
  skillCounts,
  memoryCount,
}: {
  skillCounts?: SkillCounts;
  memoryCount: number;
}) {
  const hasSkills =
    skillCounts && skillCounts.approved + skillCounts.proposed > 0;
  if (!hasSkills && memoryCount === 0) {
    return <Text dimColor>{t("retro.bagEmpty")}</Text>;
  }
  return (
    <>
      {hasSkills && (
        <Text wrap="truncate-end">
          {t("dashboard.skills")}{" "}
          <Text color="green">
            {tf("dashboard.skillsApproved", { count: skillCounts.approved })}
          </Text>
          {skillCounts.proposed > 0 && (
            <Text color="yellow">
              {" "}
              {tf("dashboard.skillsPending", { count: skillCounts.proposed })}
            </Text>
          )}
        </Text>
      )}
      {memoryCount > 0 && (
        <Text wrap="truncate-end">
          {t("dashboard.memory")}{" "}
          <Text color="cyan">
            {tf("dashboard.memoryEntries", { count: memoryCount })}
          </Text>
        </Text>
      )}
    </>
  );
}

function ClassicDashboard({
  agents,
  selectedIndex,
  tasks = [],
  stalledIds = [],
  skillCounts,
  memoryCount = 0,
  now = Date.now(),
}: DashboardProps) {
  return (
    <Box flexDirection="column">
      <Text bold underline>
        {t("dashboard.agents")}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {agents.map((agent, i) => {
          const isSelected = i === selectedIndex;
          const roleIcon = ROLE_ICON[agent.role] ?? "⬡";
          const roleColor = ROLE_COLOR[agent.role] ?? "white";
          const current = currentTaskOf(agent, tasks);
          const stalled = current && stalledIds.includes(current.id);
          return (
            <Box key={agent.name} flexDirection="column">
              <Box gap={1}>
                <Text color="cyan">{isSelected ? "▶" : " "}</Text>
                <Text>{roleIcon}</Text>
                <Text color={STATUS_COLOR[agent.status]}>
                  {STATUS_ICON[agent.status]}
                </Text>
                <Text
                  color={isSelected ? "cyan" : roleColor}
                  bold={isSelected || agent.role !== "worker"}
                >
                  {agent.name}
                </Text>
                {agent.model && (
                  <Text dimColor>
                    [
                    {agent.cli && agent.cli !== "claude" ? `${agent.cli}:` : ""}
                    {modelName(agent.cli, agent.model)}]
                  </Text>
                )}
              </Box>
              <Box marginLeft={5}>
                {current ? (
                  <Text wrap="truncate-end">
                    <Text color={stalled ? "red" : TASK_COLOR[current.state]}>
                      {stalled ? STALLED_ICON : "└"} {current.id}
                    </Text>{" "}
                    <Text
                      color={stalled ? "red" : undefined}
                      dimColor={!stalled}
                    >
                      {formatDuration(now - Date.parse(current.updatedAt))}
                    </Text>{" "}
                    <Text dimColor>{current.description}</Text>
                  </Text>
                ) : (
                  <Text dimColor>└ {t("dashboard.noTask")}</Text>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      {tasks.length > 0 &&
        (() => {
          const counts: Partial<Record<TaskState, number>> = {};
          for (const t of tasks) {
            counts[t.state] = (counts[t.state] ?? 0) + 1;
          }
          const entries = (
            Object.entries(counts) as [TaskState, number][]
          ).filter(([, c]) => c > 0);
          return (
            <Box marginTop={1} flexDirection="column">
              <Text bold underline>
                {t("dashboard.tasks")}
              </Text>
              <Box marginTop={1} columnGap={2} flexWrap="wrap">
                {entries.map(([state, count]) => (
                  <Text key={state} color={TASK_COLOR[state]}>
                    {TASK_ICON[state]} {count} {t(STATE_LABEL[state])}
                  </Text>
                ))}
                {stalledIds.length > 0 && (
                  <Text color="red" bold>
                    {STALLED_ICON}{" "}
                    {tf("dashboard.stalled", { count: stalledIds.length })}
                  </Text>
                )}
              </Box>
              <Box marginTop={1} flexDirection="column">
                {tasksToList(tasks, TASK_LIST_LIMIT, stalledIds).map((task) => (
                  <Box key={task.id} gap={1}>
                    {stalledIds.includes(task.id) ? (
                      <Text color="red">{STALLED_ICON}</Text>
                    ) : (
                      <Text color={TASK_COLOR[task.state]}>
                        {TASK_ICON[task.state]}
                      </Text>
                    )}
                    <Text wrap="truncate-end">{task.id}</Text>
                    <Text dimColor wrap="truncate-end">
                      {task.assignedTo}
                    </Text>
                  </Box>
                ))}
                {tasks.length > TASK_LIST_LIMIT && (
                  <Text dimColor>
                    {tf("dashboard.more", {
                      count: tasks.length - TASK_LIST_LIMIT,
                    })}
                  </Text>
                )}
              </Box>
            </Box>
          );
        })()}

      {skillCounts &&
        (skillCounts.approved > 0 || skillCounts.proposed > 0) && (
          <Box marginTop={1} flexDirection="column">
            <Text bold underline>
              {t("dashboard.skills")}
            </Text>
            <Box marginTop={1} gap={2}>
              {skillCounts.approved > 0 && (
                <Text color="green">
                  ✓{" "}
                  {tf("dashboard.skillsApproved", {
                    count: skillCounts.approved,
                  })}
                </Text>
              )}
              {skillCounts.proposed > 0 && (
                <Text color="yellow">
                  ○{" "}
                  {tf("dashboard.skillsPending", {
                    count: skillCounts.proposed,
                  })}
                </Text>
              )}
            </Box>
          </Box>
        )}

      {memoryCount > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold underline>
            {t("dashboard.memory")}
          </Text>
          <Box marginTop={1}>
            <Text color="cyan">
              🧠 {tf("dashboard.memoryEntries", { count: memoryCount })}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
