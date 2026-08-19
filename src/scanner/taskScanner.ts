import * as vscode from "vscode";
import { CodeTask, TaskType } from "../models/task";

export const TASK_PATTERN = /\b(TODO|FIXME|BUG|HACK|REFACTOR|TASK)\s*:\s*(.+)/i;
export const DEFAULT_SCAN_EXCLUDE_GLOB =
  "**/{node_modules,.git,dist,build,out}/**";

const SUPPORTED_TASK_TYPES: TaskType[] = [
  "TODO",
  "FIXME",
  "BUG",
  "HACK",
  "REFACTOR",
  "TASK",
];

function isTaskType(value: string): value is TaskType {
  return SUPPORTED_TASK_TYPES.includes(value as TaskType);
}

export function createTaskId(
  filePath: string,
  type: TaskType,
  title: string,
  occurrence: number,
): string {
  return [filePath, type, title.trim(), occurrence].join("|");
}

function createNewTask(
  id: string,
  type: TaskType,
  title: string,
  filePath: string,
  line: number,
): CodeTask {
  const now = new Date().toISOString();

  return {
    id,
    type,
    title: title.trim(),
    filePath,
    line,
    status: "open",
    priority: "medium",
    createdAt: now,
    updatedAt: now,
  };
}

function scanLines(filePath: string, lines: string[]): CodeTask[] {
  const taskOccurrences = new Map<string, number>();
  const tasks: CodeTask[] = [];

  lines.forEach((line, index) => {
    const match = line.match(TASK_PATTERN);

    if (!match) {
      return;
    }

    const [, rawType, title] = match;
    const type = rawType.toUpperCase();

    if (!isTaskType(type)) {
      return;
    }

    const occurrenceKey = [filePath, type, title.trim()].join("|");

    const occurrence = (taskOccurrences.get(occurrenceKey) ?? 0) + 1;

    taskOccurrences.set(occurrenceKey, occurrence);

    const taskId = createTaskId(filePath, type, title, occurrence);

    tasks.push(createNewTask(taskId, type, title, filePath, index));
  });

  return tasks;
}

export async function scanTextDocument(
  document: vscode.TextDocument,
): Promise<CodeTask[]> {
  const lines = document.getText().split(/\r?\n/);

  return scanLines(document.uri.fsPath, lines);
}

export async function scanWorkspace(
  excludeGlob: string = DEFAULT_SCAN_EXCLUDE_GLOB,
): Promise<CodeTask[]> {
  const tasks: CodeTask[] = [];

  const files = await vscode.workspace.findFiles(
    "**/*",
    excludeGlob,
  );

  for (const file of files) {
    try {
      const document = await vscode.workspace.openTextDocument(file);
      tasks.push(...(await scanTextDocument(document)));
    } catch (error) {
      console.error(`Failed to scan ${file.fsPath}`, error);
    }
  }

  return tasks;
}
