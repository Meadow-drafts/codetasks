import * as vscode from "vscode";
import { TaskStore } from "../store/taskStore";

type TreeAction = {
  kind: "workspace" | "archive";
  label: string;
  description: string;
  icon: string;
  command: string;
};

type TreeNode = TreeAction;

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
    const item = new vscode.TreeItem(
      element.label,
      vscode.TreeItemCollapsibleState.None,
    );
    item.description = element.description;
    item.iconPath = new vscode.ThemeIcon(element.icon);
    item.contextValue =
      element.kind === "workspace" ? "workspaceRoot" : "archiveRoot";

    item.command = {
      command: element.command,
      title: element.label,
    };

    return item;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (element) {
      return [];
    }

    return [
      {
        kind: "workspace",
        label: "CodeTasks",
        description: `${this.taskStore.getTaskCount()} active`,
        icon: "book",
        command: "codetasks.openWorkspace",
      },
      {
        kind: "archive",
        label: "Archived Tasks",
        description: `${this.taskStore.getArchivedTasks().length} archived`,
        icon: "archive",
        command: "codetasks.openArchivedTasks",
      },
    ];
  }
}
