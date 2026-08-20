import * as vscode from "vscode";
import * as path from "path";

type SharedAssigneeFile = {
  version: 1;
  assignees: Record<string, string>;
};

export class SharedAssigneeStore {
  constructor(
    private readonly workspaceFolder: vscode.Uri | undefined,
    private readonly relativePath: string,
  ) {}

  private get fileUri(): vscode.Uri | undefined {
    if (!this.workspaceFolder) {
      return undefined;
    }

    const segments = this.relativePath
      .split(/[\\/]/)
      .filter((segment) => segment.length > 0);

    return vscode.Uri.joinPath(this.workspaceFolder, ...segments);
  }

  async load(): Promise<Record<string, string>> {
    const fileUri = this.fileUri;

    if (!fileUri) {
      return {};
    }

    try {
      const buffer = await vscode.workspace.fs.readFile(fileUri);
      const parsed = JSON.parse(new TextDecoder().decode(buffer)) as
        | SharedAssigneeFile
        | undefined;

      return parsed?.assignees ?? {};
    } catch (error) {
      const vscodeError = error as vscode.FileSystemError & {
        code?: string;
      };

      if (vscodeError?.code === "FileNotFound") {
        return {};
      }

      console.error("CodeTasks: Failed to load shared assignees.", error);
      return {};
    }
  }

  async save(assignees: Record<string, string>): Promise<void> {
    const fileUri = this.fileUri;

    if (!fileUri) {
      return;
    }

    const entries = Object.entries(assignees).filter(([, assignee]) =>
      Boolean(assignee),
    );

    if (entries.length === 0) {
      try {
        await vscode.workspace.fs.delete(fileUri, {
          recursive: false,
          useTrash: false,
        });
      } catch (error) {
        const vscodeError = error as vscode.FileSystemError & {
          code?: string;
        };

        if (vscodeError?.code !== "FileNotFound") {
          console.error("CodeTasks: Failed to clear shared assignees.", error);
        }
      }

      return;
    }

    const payload: SharedAssigneeFile = {
      version: 1,
      assignees: Object.fromEntries(entries),
    };

    const folderUri = fileUri.with({
      path: path.dirname(fileUri.path),
    });

    await vscode.workspace.fs.createDirectory(folderUri);
    await vscode.workspace.fs.writeFile(
      fileUri,
      new TextEncoder().encode(JSON.stringify(payload, null, 2) + "\n"),
    );
  }
}
