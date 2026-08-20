import * as assert from "assert";
import * as vscode from "vscode";
import { CodeTask } from "../models/task";
import { createTaskId } from "../scanner/taskScanner";
import { parseGitHubRemoteUrl } from "../services/githubAssigneeSuggestionService";
import { reconcileTasks } from "../reconciler/taskReconciler";
import { TaskStore } from "../store/taskStore";

const TASKS_KEY = "codetasks.tasks";

class InMemoryMemento implements vscode.Memento {
  private readonly store = new Map<string, unknown>();

  keys(): readonly string[] {
    return Array.from(this.store.keys());
  }

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    if (this.store.has(key)) {
      return this.store.get(key) as T;
    }

    return defaultValue;
  }

  async update(key: string, value: any): Promise<void> {
    if (typeof value === "undefined") {
      this.store.delete(key);
      return;
    }

    this.store.set(key, value);
  }
}

function createTask(overrides: Partial<CodeTask> = {}): CodeTask {
  return {
    id: "task-1",
    type: "TODO",
    title: "Initial task",
    description: "Initial description",
    assignee: undefined,
    filePath: "/tmp/example.ts",
    line: 3,
    status: "open",
    priority: "medium",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-02T00:00:00.000Z",
    ...overrides,
  };
}

suite("CodeTasks Store", () => {
  test("createTaskId is deterministic for the same task input", () => {
    const idA = createTaskId(
      "/tmp/example.ts",
      "TODO",
      "Refine task scanning",
      1,
    );

    const idB = createTaskId(
      "/tmp/example.ts",
      "TODO",
      "Refine task scanning",
      1,
    );

    assert.strictEqual(idA, idB);
  });

  test("createTaskId distinguishes repeated task occurrences", () => {
    const first = createTaskId(
      "/tmp/example.ts",
      "TODO",
      "Refine task scanning",
      1,
    );

    const second = createTaskId(
      "/tmp/example.ts",
      "TODO",
      "Refine task scanning",
      2,
    );

    assert.notStrictEqual(first, second);
  });

  test("parseGitHubRemoteUrl handles https remotes", () => {
    const parsed = parseGitHubRemoteUrl(
      "https://github.com/meadow/codetasks.git",
    );

    assert.ok(parsed);
    assert.strictEqual(parsed?.host, "github.com");
    assert.strictEqual(parsed?.owner, "meadow");
    assert.strictEqual(parsed?.repo, "codetasks");
    assert.strictEqual(parsed?.apiBaseUrl, "https://api.github.com");
  });

  test("parseGitHubRemoteUrl handles ssh remotes", () => {
    const parsed = parseGitHubRemoteUrl(
      "git@github.com:meadow/codetasks.git",
    );

    assert.ok(parsed);
    assert.strictEqual(parsed?.host, "github.com");
    assert.strictEqual(parsed?.owner, "meadow");
    assert.strictEqual(parsed?.repo, "codetasks");
  });

  test("parseGitHubRemoteUrl ignores non-github remotes", () => {
    const parsed = parseGitHubRemoteUrl("https://example.com/meadow/codetasks");

    assert.strictEqual(parsed, undefined);
  });

  test("reconcileTasks preserves user-managed task state", () => {
    const scannedTask = createTask({
      title: "Scanned title",
      description: "Scanned description",
      status: "open",
      priority: "low",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const existingTask = createTask({
      title: "Existing title",
      description: "Existing description",
      assignee: "alice",
      status: "done",
      priority: "critical",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-02-01T00:00:00.000Z",
      archivedAt: "2024-03-01T00:00:00.000Z",
    });

    const [result] = reconcileTasks([scannedTask], [existingTask]);

    assert.strictEqual(result.title, scannedTask.title);
    assert.strictEqual(result.description, scannedTask.description);
    assert.strictEqual(result.assignee, existingTask.assignee);
    assert.strictEqual(result.status, existingTask.status);
    assert.strictEqual(result.priority, existingTask.priority);
    assert.strictEqual(result.createdAt, existingTask.createdAt);
    assert.strictEqual(result.updatedAt, existingTask.updatedAt);
    assert.strictEqual(result.archivedAt, existingTask.archivedAt);
  });

  test("archive and unarchive keep active and archived lists in sync", async () => {
    const memento = new InMemoryMemento();
    const store = new TaskStore(memento);
    const task = createTask();

    await store.setTasks([task]);

    let changeCount = 0;
    const subscription = store.onDidChange(() => {
      changeCount += 1;
    });

    const archived = await store.archiveTask(task.id);

    assert.strictEqual(archived, true);
    assert.strictEqual(changeCount, 1);
    assert.strictEqual(store.getActiveTasks().length, 0);
    assert.strictEqual(store.getArchivedTasks().length, 1);
    assert.ok(store.getArchivedTasks()[0].archivedAt);

    const restored = await store.unarchiveTask(task.id);

    assert.strictEqual(restored, true);
    assert.strictEqual(changeCount, 2);
    assert.strictEqual(store.getActiveTasks().length, 1);
    assert.strictEqual(store.getArchivedTasks().length, 0);
    assert.strictEqual(store.getTasks()[0].archivedAt, undefined);

    subscription.dispose();
  });

  test("updateTask mutates task metadata and refreshes updatedAt", async () => {
    const memento = new InMemoryMemento();
    const store = new TaskStore(memento);
    const task = createTask();

    await store.setTasks([task]);

    const updated = await store.updateTask(task.id, {
      title: "Updated title",
      description: "Updated description",
      assignee: "alice",
      status: "review",
      priority: "high",
    });

    assert.strictEqual(updated, true);

    const [result] = store.getTasks();

    assert.strictEqual(result.title, "Updated title");
    assert.strictEqual(result.description, "Updated description");
    assert.strictEqual(result.assignee, "alice");
    assert.strictEqual(result.status, "review");
    assert.strictEqual(result.priority, "high");
    assert.notStrictEqual(result.updatedAt, task.updatedAt);
  });

  test("task state persists through workspace reload", async () => {
    const memento = new InMemoryMemento();
    const initialStore = new TaskStore(memento);

    await initialStore.setTasks([createTask()]);
    await initialStore.archiveTask("task-1");

    const reloadedStore = new TaskStore(memento);
    const [archivedTask] = reloadedStore.getArchivedTasks();

    assert.ok(archivedTask);
    assert.strictEqual(archivedTask.id, "task-1");
    assert.ok(archivedTask.archivedAt);
    assert.strictEqual(memento.get<CodeTask[]>(TASKS_KEY)?.length, 1);
  });

  test("applyAssignees overlays shared assignees onto existing tasks", async () => {
    const memento = new InMemoryMemento();
    const store = new TaskStore(memento);

    await store.setTasks([
      createTask({
        id: "task-1",
        title: "Shared task",
      }),
    ]);

    await store.applyAssignees({
      "task-1": "alice",
    });

    const [task] = store.getTasks();

    assert.strictEqual(task.assignee, "alice");
  });

  test("syncTasksForFile replaces only the changed file tasks", async () => {
    const memento = new InMemoryMemento();
    const store = new TaskStore(memento);

    const fileOneTask = createTask({
      id: "file-one-task",
      filePath: "/tmp/file-one.ts",
      title: "File one task",
      line: 1,
    });

    const fileTwoTask = createTask({
      id: "file-two-task",
      filePath: "/tmp/file-two.ts",
      title: "File two task",
      line: 8,
      archivedAt: "2026-01-01T00:00:00.000Z",
    });

    await store.setTasks([fileOneTask, fileTwoTask]);

    const rescannedFileOneTask = createTask({
      id: "file-one-task",
      filePath: "/tmp/file-one.ts",
      title: "File one task updated",
      line: 3,
    });

    await store.syncTasksForFile("/tmp/file-one.ts", [rescannedFileOneTask]);

    const tasks = store.getTasks();

    assert.strictEqual(tasks.length, 2);
    assert.strictEqual(
      tasks.find((task) => task.filePath === "/tmp/file-one.ts")?.title,
      "File one task updated",
    );
    assert.strictEqual(
      tasks.find((task) => task.filePath === "/tmp/file-two.ts")?.title,
      "File two task",
    );
    assert.ok(
      tasks.find((task) => task.filePath === "/tmp/file-two.ts")?.archivedAt,
    );
  });
});
