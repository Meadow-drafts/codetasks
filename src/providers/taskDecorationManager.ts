import * as vscode from "vscode";
import { CodeTask } from "../models/task";
import { TASK_PATTERN } from "../scanner/taskScanner";
import { TaskStore } from "../store/taskStore";

type DecorationBuckets = {
  active: vscode.DecorationOptions[];
  archived: vscode.DecorationOptions[];
};

function buildTaskKey(
  filePath: string,
  line: number,
  type: CodeTask["type"],
  title: string,
): string {
  return [filePath, line, type, title.trim()].join("|");
}

function findTaskLines(document: vscode.TextDocument): Array<{
  line: number;
  type: CodeTask["type"];
  title: string;
}> {
  const lines = document.getText().split(/\r?\n/);
  const matches: Array<{
    line: number;
    type: CodeTask["type"];
    title: string;
  }> = [];

  lines.forEach((line, index) => {
    const match = line.match(TASK_PATTERN);

    if (!match) {
      return;
    }

    const [, rawType, title] = match;
    const type = rawType.toUpperCase() as CodeTask["type"];

    matches.push({
      line: index,
      type,
      title: title.trim(),
    });
  });

  return matches;
}

export class TaskDecorationManager implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  private readonly activeDecorationType: vscode.TextEditorDecorationType;

  private readonly archivedDecorationType: vscode.TextEditorDecorationType;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly taskStore: TaskStore,
  ) {
    this.activeDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.joinPath(
        this.extensionUri,
        "resources",
        "task-active.svg",
      ),
      gutterIconSize: "contain",
      overviewRulerColor: new vscode.ThemeColor("charts.blue"),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });

    this.archivedDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.joinPath(
        this.extensionUri,
        "resources",
        "task-archived.svg",
      ),
      gutterIconSize: "contain",
      overviewRulerColor: new vscode.ThemeColor("disabledForeground"),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });

    this.disposables.push(
      this.taskStore.onDidChange(() => {
        this.updateVisibleEditors();
      }),
    );

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.updateVisibleEditors();
      }),
    );

    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors(() => {
        this.updateVisibleEditors();
      }),
    );

    this.updateVisibleEditors();
  }

  refresh(): void {
    this.updateVisibleEditors();
  }

  dispose(): void {
    this.activeDecorationType.dispose();
    this.archivedDecorationType.dispose();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private getDecorationsForDocument(
    document: vscode.TextDocument,
  ): DecorationBuckets {
    const taskByKey = new Map(
      this.taskStore.getTasks().map((task) => [
        buildTaskKey(task.filePath, task.line, task.type, task.title),
        task,
      ]),
    );

    const active: vscode.DecorationOptions[] = [];
    const archived: vscode.DecorationOptions[] = [];

    for (const marker of findTaskLines(document)) {
      const task = taskByKey.get(
        buildTaskKey(document.uri.fsPath, marker.line, marker.type, marker.title),
      );

      if (!task) {
        continue;
      }

      const range = new vscode.Range(marker.line, 0, marker.line, 0);
      const decoration: vscode.DecorationOptions = {
        range,
        hoverMessage: new vscode.MarkdownString(
          [
            `**${task.type}**: ${task.title}`,
            "",
            `Status: ${task.status}`,
            `Priority: ${task.priority}`,
            task.archivedAt ? `Archived: yes` : `Archived: no`,
          ].join("\n"),
        ),
      };

      if (task.archivedAt) {
        archived.push(decoration);
      } else {
        active.push(decoration);
      }
    }

    return {
      active,
      archived,
    };
  }

  private updateVisibleEditors(): void {
    const decorationsEnabled = vscode.workspace
      .getConfiguration("codetasks")
      .get<boolean>("decorationsEnabled", true);

    for (const editor of vscode.window.visibleTextEditors) {
      if (!decorationsEnabled) {
        editor.setDecorations(this.activeDecorationType, []);
        editor.setDecorations(this.archivedDecorationType, []);
        continue;
      }

      const { active, archived } = this.getDecorationsForDocument(editor.document);

      editor.setDecorations(this.activeDecorationType, active);
      editor.setDecorations(this.archivedDecorationType, archived);
    }
  }
}
