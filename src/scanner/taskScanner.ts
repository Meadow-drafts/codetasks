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

export async function scanWorkspace(): Promise<CodeTask[]> {
  const tasks: CodeTask[] = [];

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

        tasks.push({
          id: `${file.fsPath}:${index + 1}`,
          type,
          title: title.trim(),
          filePath: file.fsPath,
          line: index,
          status: "open",
          priority: "medium",
          createdAt: new Date().toISOString(),
        });
      });
    } catch (error) {
      console.error(`Failed to scan ${file.fsPath}`, error);
    }
  }

  return tasks;
}
