import * as vscode from "vscode";
import { CodeTask } from "./models/task";
import { scanWorkspace } from "./scanner/taskScanner";
import { TaskStore } from "./store/taskStore";
import { TaskTreeProvider } from "./providers/taskTreeProvider";
import { TaskWorkspaceProvider } from "./webview/taskWorkspace";
import { TaskDetailsProvider } from "./webview/taskDetails";
import { TaskArchivedProvider } from "./webview/taskArchived";
import { TaskCodeLensProvider } from "./providers/taskCodeLensProvider";

async function pickTask(
  tasks: CodeTask[],
  placeHolder: string,
): Promise<CodeTask | undefined> {
  if (tasks.length === 0) {
    vscode.window.showInformationMessage("CodeTasks: No tasks available.");
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(
    tasks.map((task) => ({
      label: task.title,
      description: `${task.type} • ${task.status} • ${task.priority}`,
      detail: `${task.filePath}:${task.line + 1}`,
      task,
    })),
    {
      placeHolder,
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );

  return picked?.task;
}

async function getTaskAtActiveEditorLine(
  taskStore: TaskStore,
): Promise<CodeTask | undefined> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showInformationMessage(
      "CodeTasks: Open a file containing a task first.",
    );
    return undefined;
  }

  const document = editor.document;
  const lineNumber = editor.selection.active.line;

  return taskStore.getTasks().find((task) => {
    return (
      task.filePath === document.uri.fsPath &&
      task.line === lineNumber
    );
  });
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("CodeTasks is now active!");

  const taskStore = new TaskStore(context.workspaceState);

  const refreshTasks = async () => {
    const tasks = await scanWorkspace();

    await taskStore.setTasks(tasks);

    console.log(`CodeTasks found ${taskStore.getTaskCount()} task(s).`);
  };

  await refreshTasks();

  const taskTreeProvider = new TaskTreeProvider(taskStore);

  const taskWorkspaceProvider = new TaskWorkspaceProvider(
    context.extensionUri,
    taskStore,
  );

  const taskDetailsProvider = new TaskDetailsProvider(
    context.extensionUri,
    taskStore,
  );

  const taskArchivedProvider = new TaskArchivedProvider(
    context.extensionUri,
    taskStore,
  );
  const taskCodeLensProvider = new TaskCodeLensProvider(taskStore);

  vscode.window.registerTreeDataProvider(
    "codetasks.taskView",
    taskTreeProvider,
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: "file" },
      taskCodeLensProvider,
    ),
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

  const openTaskDetailsFromEditorCommand =
    vscode.commands.registerCommand(
      "codetasks.openTaskDetailsFromEditor",
      async () => {
        const task = await getTaskAtActiveEditorLine(taskStore);

        if (!task) {
          vscode.window.showInformationMessage(
            "CodeTasks: No task marker found on the current line.",
          );
          return;
        }

        taskDetailsProvider.open(task.id);
      },
    );

  const archiveTaskFromEditorCommand = vscode.commands.registerCommand(
    "codetasks.archiveTaskFromEditor",
    async () => {
      const task = await getTaskAtActiveEditorLine(taskStore);

      if (!task) {
        vscode.window.showInformationMessage(
          "CodeTasks: No task marker found on the current line.",
        );
        return;
      }

      if (task.archivedAt) {
        vscode.window.showInformationMessage(
          `Task "${task.title}" is already archived.`,
        );
        return;
      }

      const updated = await taskStore.archiveTask(task.id);

      if (!updated) {
        return;
      }

      taskTreeProvider.refresh();

      vscode.window.showInformationMessage(
        `Task "${task.title}" archived.`,
      );
    },
  );

  const markTaskDoneFromEditorCommand = vscode.commands.registerCommand(
    "codetasks.markTaskDoneFromEditor",
    async () => {
      const task = await getTaskAtActiveEditorLine(taskStore);

      if (!task) {
        vscode.window.showInformationMessage(
          "CodeTasks: No task marker found on the current line.",
        );
        return;
      }

      if (task.archivedAt) {
        vscode.window.showInformationMessage(
          `Task "${task.title}" is archived. Restore it first.`,
        );
        return;
      }

      const updated = await taskStore.updateTaskStatus(task.id, "done");

      if (!updated) {
        return;
      }

      taskTreeProvider.refresh();

      vscode.window.showInformationMessage(
        `Task "${task.title}" marked done.`,
      );
    },
  );

  const restoreTaskFromEditorCommand = vscode.commands.registerCommand(
    "codetasks.restoreTaskFromEditor",
    async () => {
      const task = await getTaskAtActiveEditorLine(taskStore);

      if (!task) {
        vscode.window.showInformationMessage(
          "CodeTasks: No task marker found on the current line.",
        );
        return;
      }

      if (!task.archivedAt) {
        vscode.window.showInformationMessage(
          `Task "${task.title}" is already active.`,
        );
        return;
      }

      const updated = await taskStore.unarchiveTask(task.id);

      if (!updated) {
        return;
      }

      taskTreeProvider.refresh();

      vscode.window.showInformationMessage(
        `Task "${task.title}" restored.`,
      );
    },
  );

  const updateTaskStatusCommand = vscode.commands.registerCommand(
    "codetasks.updateTaskStatus",
    async (task) => {
      const targetTask =
        task ?? (await pickTask(taskStore.getActiveTasks(), "Select a task"));

      if (!targetTask) {
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

      const updated = await taskStore.updateTaskStatus(
        targetTask.id,
        status.value,
      );

      if (!updated) {
        return;
      }

      taskTreeProvider.refresh();
    },
  );

  const restoreTaskCommand = vscode.commands.registerCommand(
    "codetasks.restoreTask",
    async (task) => {
      const targetTask =
        task ??
        (await pickTask(
          taskStore.getArchivedTasks(),
          "Select an archived task to restore",
        ));

      if (!targetTask) {
        return;
      }

      const updated = await taskStore.unarchiveTask(targetTask.id);

      if (!updated) {
        return;
      }

      taskTreeProvider.refresh();

      vscode.window.showInformationMessage(
        `Task "${targetTask.title}" restored.`,
      );
    },
  );

  const archiveTaskCommand = vscode.commands.registerCommand(
    "codetasks.archiveTask",
    async (task) => {
      const targetTask =
        task ??
        (await pickTask(
          taskStore.getActiveTasks(),
          "Select a task to archive",
        ));

      if (!targetTask) {
        return;
      }

      const updated = await taskStore.archiveTask(targetTask.id);

      if (!updated) {
        return;
      }

      taskTreeProvider.refresh();

      vscode.window.showInformationMessage(
        `Task "${targetTask.title}" archived.`,
      );
    },
  );

  const markTaskDoneCommand = vscode.commands.registerCommand(
    "codetasks.markTaskDone",
    async (task) => {
      const targetTask =
        task ??
        (await pickTask(
          taskStore.getActiveTasks(),
          "Select a task to mark done",
        ));

      if (!targetTask) {
        return;
      }

      const updated = await taskStore.updateTaskStatus(targetTask.id, "done");

      if (!updated) {
        return;
      }

      taskTreeProvider.refresh();

      vscode.window.showInformationMessage(
        `Task "${targetTask.title}" marked done.`,
      );
    },
  );

  const refreshTasksCommand = vscode.commands.registerCommand(
    "codetasks.refreshTasks",
    async () => {
      await refreshTasks();

      vscode.window.showInformationMessage("CodeTasks refreshed.");
    },
  );

  context.subscriptions.push(refreshTasksCommand);
  context.subscriptions.push(updateTaskStatusCommand);
  context.subscriptions.push(restoreTaskCommand);
  context.subscriptions.push(archiveTaskCommand);
  context.subscriptions.push(markTaskDoneCommand);
  context.subscriptions.push(openTaskDetailsFromEditorCommand);
  context.subscriptions.push(archiveTaskFromEditorCommand);
  context.subscriptions.push(markTaskDoneFromEditorCommand);
  context.subscriptions.push(restoreTaskFromEditorCommand);

  context.subscriptions.push(openTaskCommand);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codetasks.openTaskDetails",
      (taskId: string) => {
        taskDetailsProvider.open(taskId);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codetasks.openArchivedTasks", () => {
      taskArchivedProvider.open();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codetasks.openWorkspace", () => {
      taskWorkspaceProvider.open();
    }),
  );
}

export function deactivate() {}
