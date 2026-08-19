export type TaskType = "TODO" | "FIXME" | "BUG" | "HACK" | "REFACTOR" | "TASK";

export type TaskStatus = "open" | "in-progress" | "blocked" | "review" | "done";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface CodeTask {
  id: string;

  type: TaskType;

  title: string;

  description?: string;

  filePath: string;

  line: number;

  status: TaskStatus;

  priority: TaskPriority;

  createdAt: string;

  updatedAt: string;
  archivedAt?: string;
}
