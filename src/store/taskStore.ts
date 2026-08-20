import * as vscode from "vscode";
import { CodeTask } from "../models/task";
import { reconcileTasks } from "../reconciler/taskReconciler";

const TASKS_KEY = "codetasks.tasks";

type EditableTaskFields = Partial<
  Pick<CodeTask, "title" | "description" | "assignee" | "status" | "priority">
>;

export class TaskStore {
  private tasks: CodeTask[] = [];

  private readonly changeEmitter = new vscode.EventEmitter<void>();

  readonly onDidChange = this.changeEmitter.event;

  constructor(private readonly workspaceState: vscode.Memento) {
    this.load();
  }

  private load(): void {
    const storedTasks = this.workspaceState.get<CodeTask[]>(TASKS_KEY);

    if (storedTasks) {
      this.tasks = storedTasks;
    }
  }

  private async save(): Promise<void> {
    await this.workspaceState.update(TASKS_KEY, this.tasks);
  }

  async setTasks(scannedTasks: CodeTask[]): Promise<void> {
    this.tasks = reconcileTasks(scannedTasks, this.tasks);

    await this.save();

    this.changeEmitter.fire();
  }

  async syncTasksForFile(
    filePath: string,
    scannedTasks: CodeTask[],
  ): Promise<void> {
    const otherTasks = this.tasks.filter(
      (task) => task.filePath !== filePath,
    );
    const existingFileTasks = this.tasks.filter(
      (task) => task.filePath === filePath,
    );

    const reconciledFileTasks = reconcileTasks(
      scannedTasks,
      existingFileTasks,
    );

    this.tasks = [...otherTasks, ...reconciledFileTasks];

    await this.save();

    this.changeEmitter.fire();
  }

  async applyAssignees(
    assigneesByTaskId: Record<string, string>,
  ): Promise<void> {
    let changed = false;

    this.tasks = this.tasks.map((task) => {
      const assignee = assigneesByTaskId[task.id];

      if (task.assignee === assignee) {
        return task;
      }

      changed = true;

      if (!assignee) {
        const { assignee: _removedAssignee, ...rest } = task;
        return rest;
      }

      return {
        ...task,
        assignee,
      };
    });

    if (!changed) {
      return;
    }

    await this.save();
    this.changeEmitter.fire();
  }

  getAssigneesByTaskId(): Record<string, string> {
    return this.tasks.reduce<Record<string, string>>((acc, task) => {
      if (task.assignee) {
        acc[task.id] = task.assignee;
      }

      return acc;
    }, {});
  }

  getTasks(): CodeTask[] {
    return [...this.tasks];
  }

  getActiveTasks(): CodeTask[] {
    return this.tasks.filter((task) => !task.archivedAt);
  }

  getArchivedTasks(): CodeTask[] {
    return this.tasks.filter((task) => !!task.archivedAt);
  }

  getTaskCount(): number {
    return this.getActiveTasks().length;
  }

 getTaskStats(): {
  total: number;
  open: number;
  inProgress: number;
  blocked: number;
  review: number;
  done: number;
} {
  const activeTasks =
    this.getActiveTasks();

  return {
    total: activeTasks.length,

    open:
      activeTasks.filter(
        (task) => task.status === "open",
      ).length,

    inProgress:
      activeTasks.filter(
        (task) => task.status === "in-progress",
      ).length,

    blocked:
      activeTasks.filter(
        (task) => task.status === "blocked",
      ).length,

    review:
      activeTasks.filter(
        (task) => task.status === "review",
      ).length,

    done:
      activeTasks.filter(
        (task) => task.status === "done",
      ).length,
  };
}

  async updateTask(
    taskId: string,
    updates: EditableTaskFields,
  ): Promise<boolean> {
    const task = this.tasks.find((currentTask) => currentTask.id === taskId);

    if (!task) {
      return false;
    }

    /*
     * Apply only the fields supplied
     * by the caller.
     */
    Object.assign(task, updates);

    /*
     * Every successful task modification
     * updates the modification timestamp.
     */
    task.updatedAt = new Date().toISOString();

    /*
     * Persist the updated task list.
     */
    await this.save();

    /*
     * Notify every consumer of the store.
     */
    this.changeEmitter.fire();

    return true;
  }

  async updateTaskStatus(
    taskId: string,
    status: CodeTask["status"],
  ): Promise<boolean> {
    return this.updateTask(taskId, {
      status,
    });
  }

  async updateTaskPriority(
    taskId: string,
    priority: CodeTask["priority"],
  ): Promise<boolean> {
    return this.updateTask(taskId, {
      priority,
    });
  }

  async updateTaskAssignee(
    taskId: string,
    assignee: string | undefined,
  ): Promise<boolean> {
    return this.updateTask(taskId, {
      assignee,
    });
  }

  async archiveTask(taskId: string): Promise<boolean> {
    const task = this.tasks.find((task) => task.id === taskId);

    if (!task) {
      return false;
    }

    task.archivedAt = new Date().toISOString();

    task.updatedAt = new Date().toISOString();

    await this.save();

    this.changeEmitter.fire();

    return true;
  }

  async unarchiveTask(taskId: string): Promise<boolean> {
    const task = this.tasks.find((task) => task.id === taskId);

    if (!task) {
      return false;
    }

    delete task.archivedAt;

    task.updatedAt = new Date().toISOString();

    await this.save();

    this.changeEmitter.fire();

    return true;
  }

  clear(): void {
    this.tasks = [];

    void this.save();

    this.changeEmitter.fire();
  }
}
