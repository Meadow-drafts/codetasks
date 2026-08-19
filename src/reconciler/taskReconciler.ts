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

  return scannedTasks.map((scannedTask) => {
    const existingTask =
      existingById.get(scannedTask.id);

    /*
     * ----------------------------------------------------
     * NEW TASK
     * ----------------------------------------------------
     */

    if (!existingTask) {
      return scannedTask;
    }

    /*
     * ----------------------------------------------------
     * EXISTING TASK
     * ----------------------------------------------------
     *
     * Preserve user-managed fields while allowing
     * scanner-managed fields to be refreshed.
     */

    return {
      ...scannedTask,

      status:
        existingTask.status,

      priority:
        existingTask.priority,

      createdAt:
        existingTask.createdAt,

      updatedAt:
        existingTask.updatedAt,

      archivedAt:
        existingTask.archivedAt,
    };
  });
}