import * as vscode from "vscode";
import { TaskStore } from "../store/taskStore";
import { CodeTask, TaskPriority, TaskStatus } from "../models/task";
import { TASK_PATTERN } from "../scanner/taskScanner";

type TaskMarker = {
  line: number;
  type: CodeTask["type"];
  title: string;
};

function isSupportedTaskType(value: string): value is CodeTask["type"] {
  return ["TODO", "FIXME", "BUG", "HACK", "REFACTOR", "TASK"].includes(
    value.toUpperCase(),
  );
}

function findTaskMarkers(document: vscode.TextDocument): TaskMarker[] {
  const markers: TaskMarker[] = [];
  const lines = document.getText().split(/\r?\n/);

  lines.forEach((line, index) => {
    const match = line.match(TASK_PATTERN);

    if (!match) {
      return;
    }

    const [, rawType, title] = match;
    const type = rawType.toUpperCase();

    if (!isSupportedTaskType(type)) {
      return;
    }

    markers.push({
      line: index,
      type,
      title: title.trim(),
    });
  });

  return markers;
}

function formatStatus(status: TaskStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "in-progress":
      return "In Progress";
    case "blocked":
      return "Blocked";
    case "review":
      return "Review";
    case "done":
      return "Done";
    default:
      return status;
  }
}

function formatPriority(priority: TaskPriority): string {
  switch (priority) {
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "critical":
      return "Critical";
    default:
      return priority;
  }
}

export class TaskCodeLensProvider implements vscode.CodeLensProvider {
  private readonly onDidChangeCodeLensesEmitter =
    new vscode.EventEmitter<void>();

  readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

  constructor(private readonly taskStore: TaskStore) {
    this.taskStore.onDidChange(() => {
      this.onDidChangeCodeLensesEmitter.fire();
    });
  }

  refresh(): void {
    this.onDidChangeCodeLensesEmitter.fire();
  }

  provideCodeLenses(
    document: vscode.TextDocument,
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    if (
      !vscode.workspace
        .getConfiguration("codetasks")
        .get<boolean>("codeLensEnabled", true)
    ) {
      return [];
    }

    const markers = findTaskMarkers(document);
    const taskByLocation = new Map(
      this.taskStore.getTasks().map((task) => [
        [task.filePath, task.line, task.type, task.title.trim()].join("|"),
        task,
      ]),
    );

    return markers.flatMap((marker) => {
      const task = taskByLocation.get(
        [
          document.uri.fsPath,
          marker.line,
          marker.type,
          marker.title,
        ].join("|"),
      );

      if (!task) {
        return [];
      }

      const range = new vscode.Range(marker.line, 0, marker.line, 0);
      const lenses: vscode.CodeLens[] = [
        new vscode.CodeLens(range, {
          title: "Open Task Details",
          command: "codetasks.openTaskDetails",
          arguments: [task.id],
        }),
      ];

      if (task.archivedAt) {
        lenses.push(
          new vscode.CodeLens(range, {
            title: "Restore Task",
            command: "codetasks.restoreTask",
            arguments: [task],
          }),
        );
      } else {
        lenses.push(
          new vscode.CodeLens(range, {
            title: "Mark Done",
            command: "codetasks.markTaskDone",
            arguments: [task],
          }),
        );

        lenses.push(
          new vscode.CodeLens(range, {
            title: "Archive Task",
            command: "codetasks.archiveTask",
            arguments: [task],
          }),
        );
      }

      return lenses;
    });
  }
}
