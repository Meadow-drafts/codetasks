import { CodeTask } from '../models/task';

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

	clear(): void {
		this.tasks = [];
	}
}