export type TaskStatus =
	| 'open'
	| 'in-progress'
	| 'blocked'
	| 'review'
	| 'done';

export type TaskPriority =
	| 'low'
	| 'medium'
	| 'high'
	| 'critical';

export interface CodeTask {
	id: string;
	type: string;
	title: string;

	filePath: string;
	line: number;

	status: TaskStatus;
	priority: TaskPriority;

	createdAt: string;
}