import * as vscode from "vscode";
import { scanWorkspace } from "./scanner/taskScanner";
import { TaskStore } from "./store/taskStore";
import { TaskTreeProvider } from "./providers/taskTreeProvider";
import { TaskWorkspaceProvider } from "./webview/taskWorkspace";

export async function activate(context: vscode.ExtensionContext) {
  console.log("CodeTasks is now active!");

  const taskStore = new TaskStore();

  const tasks = await scanWorkspace();

  taskStore.setTasks(tasks);

  console.log(`CodeTasks found ${taskStore.getTaskCount()} task(s).`);

  const taskTreeProvider = new TaskTreeProvider(taskStore);

  const taskWorkspaceProvider = new TaskWorkspaceProvider(
    context.extensionUri,
    taskStore,
  );

  vscode.window.registerTreeDataProvider(
    "codetasks.taskView",
    taskTreeProvider,
  );

  const openTaskCommand = vscode.commands.registerCommand(
    "codetasks.openTask",
    async (task) => {
      if (!task) {
        return;
      }

      const document = await vscode.workspace.openTextDocument(task.filePath);

      const editor = await vscode.window.showTextDocument(document);

      const position = new vscode.Position(task.line, 0);

      editor.selection = new vscode.Selection(position, position);

      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter,
      );
    },
  );

  const updateTaskStatusCommand = vscode.commands.registerCommand(
    "codetasks.updateTaskStatus",
    async (task) => {
      if (!task) {
        return;
      }

      const status = await vscode.window.showQuickPick(
        [
          {
            label: "Open",
            value: "open" as const,
          },
          {
            label: "In Progress",
            value: "in-progress" as const,
          },
          {
            label: "Blocked",
            value: "blocked" as const,
          },
          {
            label: "Review",
            value: "review" as const,
          },
          {
            label: "Done",
            value: "done" as const,
          },
        ],
        {
          placeHolder: "Select task status",
        },
      );

      if (!status) {
        return;
      }

      taskStore.updateTaskStatus(task.id, status.value);

      taskTreeProvider.refresh();
    },
  );

  context.subscriptions.push(updateTaskStatusCommand);

  context.subscriptions.push(openTaskCommand);

  context.subscriptions.push(
    vscode.commands.registerCommand("codetasks.openWorkspace", () => {
      taskWorkspaceProvider.open();
    }),
  );
}

export function deactivate() {}
