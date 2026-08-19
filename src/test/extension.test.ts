import * as assert from "assert";
import * as vscode from "vscode";
import { CodeTask } from "../models/task";
import { createTaskId } from "../scanner/taskScanner";
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
      status: "done",
      priority: "critical",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-02-01T00:00:00.000Z",
      archivedAt: "2024-03-01T00:00:00.000Z",
    });

    const [result] = reconcileTasks([scannedTask], [existingTask]);

    assert.strictEqual(result.title, scannedTask.title);
    assert.strictEqual(result.description, scannedTask.description);
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
      status: "review",
      priority: "high",
    });

    assert.strictEqual(updated, true);

    const [result] = store.getTasks();

    assert.strictEqual(result.title, "Updated title");
    assert.strictEqual(result.description, "Updated description");
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
});
