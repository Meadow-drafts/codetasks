import * as vscode from "vscode";
import { CodeTask, TaskType } from "../models/task";

const TASK_PATTERN = /\b(TODO|FIXME|BUG|HACK|REFACTOR|TASK)\s*:\s*(.+)/i;

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

export async function scanWorkspace(): Promise<CodeTask[]> {
  const tasks: CodeTask[] = [];

  const taskOccurrences = new Map<string, number>();

  const files = await vscode.workspace.findFiles(
    "**/*",
    "**/{node_modules,.git,dist,build,out}/**",
  );

  for (const file of files) {
    try {
      const document = await vscode.workspace.openTextDocument(file);
      const lines = document.getText().split(/\r?\n/);

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

        const occurrenceKey = [file.fsPath, type, title.trim()].join("|");

        const occurrence = (taskOccurrences.get(occurrenceKey) ?? 0) + 1;

        taskOccurrences.set(occurrenceKey, occurrence);

        const taskId = createTaskId(file.fsPath, type, title, occurrence);

        tasks.push(createNewTask(taskId, type, title, file.fsPath, index));
      });
    } catch (error) {
      console.error(`Failed to scan ${file.fsPath}`, error);
    }
  }

  return tasks;
}
