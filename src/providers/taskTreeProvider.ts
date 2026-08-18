import * as vscode from "vscode";
import { CodeTask } from "../models/task";
import { TaskStore } from "../store/taskStore";

function getTaskIcon(type: string): vscode.ThemeIcon {
  switch (type.toUpperCase()) {
    case "TODO":
      return new vscode.ThemeIcon("check");

    case "FIXME":
      return new vscode.ThemeIcon("wrench");

    case "BUG":
      return new vscode.ThemeIcon("bug");

    case "HACK":
      return new vscode.ThemeIcon("warning");

    case "REFACTOR":
      return new vscode.ThemeIcon("symbol-method");

    default:
      return new vscode.ThemeIcon("circle-outline");
  }
}

type TaskGroup = {
  type: string;
  tasks: CodeTask[];
};

type TreeNode = TaskGroup | CodeTask;

export class TaskTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined | null | void
  >();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly taskStore: TaskStore) {
    this.taskStore.onDidChange(() => {
	this._onDidChangeTreeData.fire();
});
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (this.isTaskGroup(element)) {
      const item = new vscode.TreeItem(
        element.type,
        vscode.TreeItemCollapsibleState.Expanded,
      );

      item.description = `${element.tasks.length}`;
      item.iconPath = getTaskIcon(element.type);

      return item;
    }

    const item = new vscode.TreeItem(
      element.title,
      vscode.TreeItemCollapsibleState.None,
    );
    item.contextValue = 'task';

    item.iconPath = new vscode.ThemeIcon("circle-outline");
    item.description = `line ${element.line + 1}`;

    item.tooltip = `${element.type}: ${element.title}`;

    item.command = {
      command: "codetasks.openTask",
      title: "Open Task",
      arguments: [element],
    };

    return item;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this.createGroups();
    }

    if (this.isTaskGroup(element)) {
      return element.tasks;
    }

    return [];
  }

  private createGroups(): TaskGroup[] {
    const tasks = this.taskStore.getTasks();

    const groups = new Map<string, CodeTask[]>();

    for (const task of tasks) {
      const existing = groups.get(task.type) ?? [];

      existing.push(task);

      groups.set(task.type, existing);
    }

    return Array.from(groups.entries()).map(([type, tasks]) => ({
      type,
      tasks,
    }));
  }

  private isTaskGroup(element: TreeNode): element is TaskGroup {
    return "tasks" in element;
  }
}
