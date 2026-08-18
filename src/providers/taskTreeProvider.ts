import * as vscode from 'vscode';
import { CodeTask } from '../models/task';
import { TaskStore } from '../store/taskStore';

export class TaskTreeProvider
	implements vscode.TreeDataProvider<CodeTask> {

	private readonly _onDidChangeTreeData =
		new vscode.EventEmitter<CodeTask | undefined | null | void>();

	readonly onDidChangeTreeData =
		this._onDidChangeTreeData.event;

	constructor(private readonly taskStore: TaskStore) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(task: CodeTask): vscode.TreeItem {
		const item = new vscode.TreeItem(
			task.title,
			vscode.TreeItemCollapsibleState.None
		);

		item.description = `${task.type} • line ${task.line + 1}`;

		item.tooltip = `${task.type}: ${task.title}`;

		item.command = {
			command: 'codetasks.openTask',
			title: 'Open Task',
			arguments: [task],
		};

		return item;
	}

	getChildren(): CodeTask[] {
		return this.taskStore.getTasks();
	}
}