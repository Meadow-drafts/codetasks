import * as vscode from "vscode";
import { CodeTask, TaskType } from "../models/task";

export const TASK_PATTERN = /\b(TODO|FIXME|BUG|HACK|REFACTOR|TASK)\s*:\s*(.+)/i;
export const DEFAULT_SCAN_EXCLUDE_GLOB =
  "**/{node_modules,.git,dist,build,out}/**";

type CommentDelimiter = {
  start: string;
  end: string;
};

type CommentSyntax = {
  linePrefixes: string[];
  blockDelimiters: CommentDelimiter[];
};

type TaskMarker = {
  line: number;
  type: TaskType;
  title: string;
};

const SUPPORTED_TASK_TYPES: TaskType[] = [
  "TODO",
  "FIXME",
  "BUG",
  "HACK",
  "REFACTOR",
  "TASK",
];

function isTaskType(value: string): value is TaskType {
  return SUPPORTED_TASK_TYPES.includes(value as TaskType);
}

function getCommentSyntax(languageId: string): CommentSyntax {
  switch (languageId.toLowerCase()) {
    case "javascript":
    case "javascriptreact":
    case "typescript":
    case "typescriptreact":
    case "javascriptvue":
    case "javascriptstandard":
    case "coffeescript":
    case "jsonc":
    case "json5":
    case "java":
    case "c":
    case "cpp":
    case "csharp":
    case "go":
    case "rust":
    case "kotlin":
    case "swift":
    case "dart":
    case "php":
    case "scala":
    case "groovy":
    case "objective-c":
    case "objective-cpp":
    case "fsharp":
      return {
        linePrefixes: ["//"],
        blockDelimiters: [{ start: "/*", end: "*/" }],
      };
    case "css":
    case "scss":
    case "less":
      return {
        linePrefixes: [],
        blockDelimiters: [{ start: "/*", end: "*/" }],
      };
    case "html":
    case "htm":
    case "xml":
    case "xsl":
    case "svg":
    case "vue":
    case "svelte":
    case "astro":
    case "markdown":
    case "md":
    case "mdx":
      return {
        linePrefixes: [],
        blockDelimiters: [{ start: "<!--", end: "-->" }],
      };
    case "python":
    case "shellscript":
    case "shellsession":
    case "bash":
    case "zsh":
    case "yaml":
    case "dockerfile":
    case "makefile":
    case "r":
    case "perl":
    case "ruby":
    case "nim":
    case "toml":
    case "elixir":
    case "erlang":
    case "graphql":
    case "haskell":
    case "shell":
    case "powershell":
      return {
        linePrefixes:
          languageId.toLowerCase() === "erlang"
            ? ["%"]
            : languageId.toLowerCase() === "haskell"
              ? ["--"]
              : ["#"],
        blockDelimiters:
          languageId.toLowerCase() === "ruby"
            ? [{ start: "=begin", end: "=end" }]
            : [],
      };
    case "sql":
      return {
        linePrefixes: ["--"],
        blockDelimiters: [{ start: "/*", end: "*/" }],
      };
    case "ini":
    case "properties":
      return {
        linePrefixes: ["#", ";"],
        blockDelimiters: [],
      };
    case "lua":
      return {
        linePrefixes: ["--"],
        blockDelimiters: [{ start: "--[[", end: "]]" }],
      };
    default:
      return {
        linePrefixes: ["//", "#", ";", "--"],
        blockDelimiters: [
          { start: "/*", end: "*/" },
          { start: "<!--", end: "-->" },
        ],
      };
  }
}

function findLineCommentPrefix(
  line: string,
  syntax: CommentSyntax,
): { index: number; prefix: string } | undefined {
  let earliest: { index: number; prefix: string } | undefined;

  for (const prefix of syntax.linePrefixes) {
    const index = line.indexOf(prefix);

    if (index === -1) {
      continue;
    }

    if (!earliest || index < earliest.index) {
      earliest = {
        index,
        prefix,
      };
    }
  }

  return earliest;
}

function findBlockDelimiterStart(
  line: string,
  syntax: CommentSyntax,
): { delimiter: CommentDelimiter; index: number } | undefined {
  let earliest: { delimiter: CommentDelimiter; index: number } | undefined;

  for (const delimiter of syntax.blockDelimiters) {
    const index = line.indexOf(delimiter.start);

    if (index === -1) {
      continue;
    }

    if (!earliest || index < earliest.index) {
      earliest = {
        delimiter,
        index,
      };
    }
  }

  return earliest;
}

function extractTaskMarkersFromDocument(
  text: string,
  languageId: string,
): TaskMarker[] {
  const lines = text.split(/\r?\n/);
  const syntax = getCommentSyntax(languageId);
  const markers: TaskMarker[] = [];

  const pushMarker = (line: number, commentText: string) => {
    const match = commentText.match(TASK_PATTERN);

    if (!match) {
      return;
    }

    const [, rawType, title] = match;
    const type = rawType.toUpperCase();

    if (!isTaskType(type)) {
      return;
    }

    markers.push({
      line,
      type,
      title: title.trim(),
    });
  };

  let activeBlock:
    | {
        delimiter: CommentDelimiter;
        line: number;
        text: string;
      }
    | undefined;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    let cursor = 0;

    while (cursor < line.length) {
      if (activeBlock) {
        const endIndex = line.indexOf(activeBlock.delimiter.end, cursor);

        if (endIndex === -1) {
          activeBlock.text += `${activeBlock.text ? "\n" : ""}${line.slice(
            cursor,
          )}`;
          break;
        }

        activeBlock.text += `${activeBlock.text ? "\n" : ""}${line.slice(
          cursor,
          endIndex,
        )}`;
        pushMarker(activeBlock.line, activeBlock.text);
        cursor = endIndex + activeBlock.delimiter.end.length;
        activeBlock = undefined;
        continue;
      }

      const lineSlice = line.slice(cursor);
      const lineComment = findLineCommentPrefix(lineSlice, syntax);
      const blockStart = findBlockDelimiterStart(lineSlice, syntax);

      if (!lineComment && !blockStart) {
        break;
      }

      const absoluteLineCommentIndex = lineComment
        ? cursor + lineComment.index
        : Number.POSITIVE_INFINITY;
      const absoluteBlockStartIndex = blockStart
        ? cursor + blockStart.index
        : Number.POSITIVE_INFINITY;

      if (absoluteLineCommentIndex < absoluteBlockStartIndex) {
        pushMarker(
          lineIndex,
          line.slice(absoluteLineCommentIndex + lineComment!.prefix.length),
        );
        break;
      }

      const delimiter = blockStart!.delimiter;
      const blockContentStart = absoluteBlockStartIndex + delimiter.start.length;
      const blockEndIndex = line.indexOf(delimiter.end, blockContentStart);

      if (blockEndIndex !== -1) {
        pushMarker(lineIndex, line.slice(blockContentStart, blockEndIndex));
        cursor = blockEndIndex + delimiter.end.length;
        continue;
      }

      activeBlock = {
        delimiter,
        line: lineIndex,
        text: line.slice(blockContentStart),
      };
      break;
    }
  }

  if (activeBlock) {
    pushMarker(activeBlock.line, activeBlock.text);
  }

  return markers;
}

export function createTaskId(
  filePath: string,
  type: TaskType,
  title: string,
  occurrence: number,
): string {
  return [filePath, type, title.trim(), occurrence].join("|");
}

function createNewTask(
  id: string,
  type: TaskType,
  title: string,
  filePath: string,
  line: number,
): CodeTask {
  const now = new Date().toISOString();

  return {
    id,
    type,
    title: title.trim(),
    filePath,
    line,
    status: "open",
    priority: "medium",
    createdAt: now,
    updatedAt: now,
  };
}

function scanMarkers(filePath: string, markers: TaskMarker[]): CodeTask[] {
  const taskOccurrences = new Map<string, number>();

  return markers.map(({ line, type, title }) => {
    const occurrenceKey = [filePath, type, title.trim()].join("|");
    const occurrence = (taskOccurrences.get(occurrenceKey) ?? 0) + 1;

    taskOccurrences.set(occurrenceKey, occurrence);

    const taskId = createTaskId(filePath, type, title, occurrence);

    return createNewTask(taskId, type, title, filePath, line);
  });
}

export function findTaskMarkers(
  document: vscode.TextDocument | { getText(): string; languageId: string },
): Array<{ line: number; type: TaskType; title: string }> {
  return extractTaskMarkersFromDocument(document.getText(), document.languageId);
}

export function documentHasTaskMarkers(
  document: vscode.TextDocument | { getText(): string; languageId: string },
): boolean {
  return extractTaskMarkersFromDocument(document.getText(), document.languageId).length > 0;
}

export function scanTextContent(
  filePath: string,
  languageId: string,
  text: string,
): CodeTask[] {
  return scanMarkers(filePath, extractTaskMarkersFromDocument(text, languageId));
}

export async function scanTextDocument(
  document: vscode.TextDocument,
): Promise<CodeTask[]> {
  return scanTextContent(
    document.uri.fsPath,
    document.languageId,
    document.getText(),
  );
}

export async function scanWorkspace(
  excludeGlob: string = DEFAULT_SCAN_EXCLUDE_GLOB,
): Promise<CodeTask[]> {
  const tasks: CodeTask[] = [];

  const files = await vscode.workspace.findFiles(
    "**/*",
    excludeGlob,
  );

  for (const file of files) {
    try {
      const document = await vscode.workspace.openTextDocument(file);
      tasks.push(...(await scanTextDocument(document)));
    } catch (error) {
      console.error(`Failed to scan ${file.fsPath}`, error);
    }
  }

  return tasks;
}
