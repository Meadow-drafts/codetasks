import { CodeTask } from "../models/task";

export function reconcileTasks(
  scannedTasks: CodeTask[],
  existingTasks: CodeTask[],
): CodeTask[] {

  const existingById = new Map(
    existingTasks.map((task) => [
      task.id,
      task,
    ]),
  );

  return scannedTasks.map(
    (scannedTask) => {

      const existing =
        existingById.get(scannedTask.id);

      if (!existing) {
        return scannedTask;
      }

      return {
        ...scannedTask,

        status: existing.status,
        priority: existing.priority,

        createdAt:
          existing.createdAt,

        updatedAt:
          existing.updatedAt,
      };
    },
  );
}