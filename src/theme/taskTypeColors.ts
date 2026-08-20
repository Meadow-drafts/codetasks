import * as vscode from "vscode";
import { TaskType } from "../models/task";

export const TASK_TYPES: TaskType[] = [
  "TODO",
  "FIXME",
  "BUG",
  "HACK",
  "REFACTOR",
  "TASK",
];

export const DEFAULT_TASK_TYPE_COLORS: Record<TaskType, string> = {
  TODO: "#4B9CFF",
  FIXME: "#FFB020",
  BUG: "#FF5C7A",
  HACK: "#B56BFF",
  REFACTOR: "#45C48C",
  TASK: "#8A94A6",
};

export type TaskTypeColorConfig = Partial<Record<TaskType, string>>;

export function getTaskTypeColors(
  overrides?: TaskTypeColorConfig,
): Record<TaskType, string> {
  const configOverrides =
    overrides ??
    vscode.workspace
      .getConfiguration("codetasks")
      .get<TaskTypeColorConfig>("typeColors", {});

  return TASK_TYPES.reduce((acc, type) => {
    acc[type] = configOverrides?.[type] || DEFAULT_TASK_TYPE_COLORS[type];
    return acc;
  }, {} as Record<TaskType, string>);
}

export function getTaskTypeColor(type: TaskType): string {
  return getTaskTypeColors()[type];
}

export function buildTaskTypeCssVariables(
  overrides?: TaskTypeColorConfig,
): string {
  const colors = getTaskTypeColors(overrides);

  return TASK_TYPES.map(
    (type) => `--codetasks-task-type-${type.toLowerCase()}: ${colors[type]};`,
  ).join(" ");
}

export function createTaskTypeIconDataUri(
  color: string,
  opacity = 1,
): vscode.Uri {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="5.25" fill="${color}" fill-opacity="${opacity}" />
    </svg>
  `;

  return vscode.Uri.parse(
    `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`,
  );
}
