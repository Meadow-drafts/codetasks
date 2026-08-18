import * as vscode from "vscode";
import { CodeTask } from "../models/task";

export class TaskStore {
  private readonly _onDidChange = new vscode.EventEmitter<void>();

  readonly onDidChange = this._onDidChange.event;

  private tasks: CodeTask[] = [];

  setTasks(tasks: CodeTask[]): void {
    this.tasks = tasks;
  }

  getTasks(): CodeTask[] {
    return [...this.tasks];
  }

  getTaskCount(): number {
    return this.tasks.length;
  }
  updateTaskStatus(taskId: string, status: CodeTask["status"]): boolean {
    const task = this.tasks.find((task) => task.id === taskId);

    if (!task) {
      return false;
    }

    task.status = status;

    this._onDidChange.fire();

    return true;
  }
  clear(): void {
    this.tasks = [];
  }
}
