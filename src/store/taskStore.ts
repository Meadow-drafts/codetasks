import * as vscode from "vscode";
import { CodeTask } from "../models/task";
import { reconcileTasks } from "../reconciler/taskReconciler";


const TASKS_KEY = "codetasks.tasks";

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

async setTasks(
  scannedTasks: CodeTask[],
): Promise<void> {

  this.tasks = reconcileTasks(
    scannedTasks,
    this.tasks,
  );

  await this.save();

  this.changeEmitter.fire();
}

  getTasks(): CodeTask[] {
    return [...this.tasks];
  }

  getTaskCount(): number {
    return this.tasks.length;
  }

  async updateTaskStatus(
    taskId: string,
    status: CodeTask["status"],
  ): Promise<boolean> {
    const task = this.tasks.find((task) => task.id === taskId);

    if (!task) {
      return false;
    }

    task.status = status;

    task.updatedAt = new Date().toISOString();

    await this.save();
    this.changeEmitter.fire();

    return true;
  }

  async updateTaskPriority(
    taskId: string,
    priority: CodeTask["priority"],
  ): Promise<boolean> {
    const task = this.tasks.find((task) => task.id === taskId);

    if (!task) {
      return false;
    }

    task.priority = priority;

    task.updatedAt = new Date().toISOString();

    await this.save();
    this.changeEmitter.fire();

    return true;
  }

  clear(): void {
    this.tasks = [];

    void this.save();
  }
}
