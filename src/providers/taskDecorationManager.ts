import * as vscode from "vscode";
import { CodeTask } from "../models/task";
import { TASK_PATTERN } from "../scanner/taskScanner";
import { TaskStore } from "../store/taskStore";
import {
  createTaskTypeIconDataUri,
  getTaskTypeColors,
  TASK_TYPES,
} from "../theme/taskTypeColors";

type DecorationBuckets = Record<CodeTask["type"], vscode.DecorationOptions[]>;

function buildTaskKey(
  filePath: string,
  line: number,
  type: CodeTask["type"],
  title: string,
): string {
  return [filePath, line, type, title.trim()].join("|");
}

function createEmptyBuckets(): DecorationBuckets {
  return {
    TODO: [],
    FIXME: [],
    BUG: [],
    HACK: [],
    REFACTOR: [],
    TASK: [],
  };
}

function findTaskMarkers(document: vscode.TextDocument): Array<{
  line: number;
  type: CodeTask["type"];
  title: string;
}> {
  const lines = document.getText().split(/\r?\n/);
  const markers: Array<{
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

    markers.push({
      line: index,
      type,
      title: title.trim(),
    });
  });

  return markers;
}

export class TaskDecorationManager implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  private activeDecorationTypes = new Map<
    CodeTask["type"],
    vscode.TextEditorDecorationType
  >();

  private archivedDecorationTypes = new Map<
    CodeTask["type"],
    vscode.TextEditorDecorationType
  >();

  constructor(private readonly taskStore: TaskStore) {
    this.rebuildDecorationTypes();

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
    this.rebuildDecorationTypes();
    this.updateVisibleEditors();
  }

  dispose(): void {
    for (const decoration of this.activeDecorationTypes.values()) {
      decoration.dispose();
    }

    for (const decoration of this.archivedDecorationTypes.values()) {
      decoration.dispose();
    }

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private rebuildDecorationTypes(): void {
    for (const decoration of this.activeDecorationTypes.values()) {
      decoration.dispose();
    }

    for (const decoration of this.archivedDecorationTypes.values()) {
      decoration.dispose();
    }

    this.activeDecorationTypes = new Map();
    this.archivedDecorationTypes = new Map();

    const colors = getTaskTypeColors();

    for (const type of TASK_TYPES) {
      const color = colors[type];

      this.activeDecorationTypes.set(
        type,
        vscode.window.createTextEditorDecorationType({
          gutterIconPath: createTaskTypeIconDataUri(color),
          gutterIconSize: "contain",
          overviewRulerColor: color,
          overviewRulerLane: vscode.OverviewRulerLane.Left,
        }),
      );

      this.archivedDecorationTypes.set(
        type,
        vscode.window.createTextEditorDecorationType({
          gutterIconPath: createTaskTypeIconDataUri(color, 0.45),
          gutterIconSize: "contain",
          overviewRulerColor: color,
          overviewRulerLane: vscode.OverviewRulerLane.Left,
        }),
      );
    }
  }

  private getDecorationsForDocument(
    document: vscode.TextDocument,
  ): {
    active: DecorationBuckets;
    archived: DecorationBuckets;
  } {
    const taskByKey = new Map(
      this.taskStore.getTasks().map((task) => [
        buildTaskKey(task.filePath, task.line, task.type, task.title),
        task,
      ]),
    );

    const active = createEmptyBuckets();
    const archived = createEmptyBuckets();

    for (const marker of findTaskMarkers(document)) {
      const task = taskByKey.get(
        buildTaskKey(
          document.uri.fsPath,
          marker.line,
          marker.type,
          marker.title,
        ),
      );

      if (!task) {
        continue;
      }

      const decoration: vscode.DecorationOptions = {
        range: new vscode.Range(marker.line, 0, marker.line, 0),
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
        archived[task.type].push(decoration);
      } else {
        active[task.type].push(decoration);
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
        for (const type of TASK_TYPES) {
          editor.setDecorations(this.activeDecorationTypes.get(type)!, []);
          editor.setDecorations(this.archivedDecorationTypes.get(type)!, []);
        }

        continue;
      }

      const { active, archived } = this.getDecorationsForDocument(
        editor.document,
      );

      for (const type of TASK_TYPES) {
        editor.setDecorations(
          this.activeDecorationTypes.get(type)!,
          active[type],
        );
        editor.setDecorations(
          this.archivedDecorationTypes.get(type)!,
          archived[type],
        );
      }
    }
  }
}
