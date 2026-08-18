import { CodeTask } from "../models/task";

export class TaskStore {
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

    return true;
  }
  clear(): void {
    this.tasks = [];
  }
}
