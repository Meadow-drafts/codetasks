import * as vscode from "vscode";
import { CodeTask, TaskPriority, TaskStatus } from "../models/task";
import { TaskStore } from "../store/taskStore";
import { buildTaskTypeCssVariables } from "../theme/taskTypeColors";

export class TaskDetailsProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly taskStore: TaskStore,
  ) {}

  open(taskId: string): void {
    const task = this.taskStore
      .getTasks()
      .find((currentTask) => currentTask.id === taskId);

    if (!task) {
      vscode.window.showErrorMessage("CodeTasks: Task not found.");

      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "codetasks.taskDetails",
      "Task Details",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
      },
    );

    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "back") {
        panel.dispose();
        return;
      }

      if (message.command === "openSource") {
        const latestTask = this.taskStore
          .getTasks()
          .find((currentTask) => currentTask.id === taskId);

        if (!latestTask) {
          return;
        }

        const document = await vscode.workspace.openTextDocument(
          latestTask.filePath,
        );

        const editor = await vscode.window.showTextDocument(document);

        const position = new vscode.Position(latestTask.line, 0);

        editor.selection = new vscode.Selection(position, position);

        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter,
        );

        return;
      }

      if (message.command === "updateStatus") {
        const status = message.status as TaskStatus;

        const updated = await this.taskStore.updateTask(taskId, {
          status,
        });

        if (!updated) {
          panel.webview.postMessage({
            command: "statusUpdateFailed",
          });

          vscode.window.showErrorMessage(
            "CodeTasks: Failed to update task status.",
          );

          return;
        }

        const latestTask = this.taskStore
          .getTasks()
          .find((currentTask) => currentTask.id === taskId);

        if (!latestTask) {
          return;
        }

        panel.webview.postMessage({
          command: "statusUpdated",
          status: latestTask.status,
          updatedAt: latestTask.updatedAt,
        });

        return;
      }

      if (message.command === "updatePriority") {
        const priority = message.priority as TaskPriority;

        const updated = await this.taskStore.updateTask(taskId, {
          priority,
        });

        if (!updated) {
          panel.webview.postMessage({
            command: "priorityUpdateFailed",
          });

          vscode.window.showErrorMessage(
            "CodeTasks: Failed to update task priority.",
          );

          return;
        }

        const latestTask = this.taskStore
          .getTasks()
          .find((currentTask) => currentTask.id === taskId);

        if (!latestTask) {
          return;
        }

        panel.webview.postMessage({
          command: "priorityUpdated",
          priority: latestTask.priority,
          updatedAt: latestTask.updatedAt,
        });

        return;
      }

      if (message.command === "archiveTask") {
        const confirmation = await vscode.window.showWarningMessage(
          "Are you sure you want to archive this task?",
          {
            modal: true,
          },
          "Archive",
        );

        if (confirmation !== "Archive") {
          panel.webview.postMessage({
            command: "archiveCancelled",
          });

          return;
        }

        const updated = await this.taskStore.archiveTask(taskId);

        if (!updated) {
          panel.webview.postMessage({
            command: "archiveTaskFailed",
            error: "Failed to archive task.",
          });

          vscode.window.showErrorMessage("CodeTasks: Failed to archive task.");

          return;
        }

        panel.webview.postMessage({
          command: "taskArchived",
          taskId,
        });

        return;
      }

      if (message.command === "unarchiveTask") {
        const updated = await this.taskStore.unarchiveTask(taskId);

        if (!updated) {
          panel.webview.postMessage({
            command: "unarchiveTaskFailed",
            error: "Failed to restore task.",
          });

          vscode.window.showErrorMessage("CodeTasks: Failed to restore task.");

          return;
        }

        panel.webview.postMessage({
          command: "taskUnarchived",
          taskId,
        });

        return;
      }

      if (message.command === "saveTask") {
        const title =
          typeof message.title === "string" ? message.title.trim() : "";

        const description =
          typeof message.description === "string"
            ? message.description.trim()
            : "";

        if (!title) {
          panel.webview.postMessage({
            command: "saveTaskFailed",
            error: "Task title cannot be empty.",
          });

          return;
        }

        const updated = await this.taskStore.updateTask(taskId, {
          title,
          description: description || undefined,
        });

        if (!updated) {
          panel.webview.postMessage({
            command: "saveTaskFailed",
            error: "Failed to save task.",
          });

          vscode.window.showErrorMessage("CodeTasks: Failed to save task.");

          return;
        }

        const latestTask = this.taskStore
          .getTasks()
          .find((currentTask) => currentTask.id === taskId);

        if (!latestTask) {
          return;
        }

        panel.webview.postMessage({
          command: "taskSaved",
          task: latestTask,
        });

        return;
      }
    });

    panel.webview.html = this.getHtml(task);

    const storeChangeSubscription = this.taskStore.onDidChange(() => {
      const latestTask = this.taskStore
        .getTasks()
        .find((currentTask) => currentTask.id === taskId);

      if (!latestTask) {
        return;
      }

      panel.webview.postMessage({
        command: "taskUpdated",
        task: latestTask,
      });
    });

    panel.onDidDispose(() => {
      storeChangeSubscription.dispose();
    });
  }

  private getHtml(task: CodeTask): string {
    const taskTypeCssVars = buildTaskTypeCssVariables();
    const taskTypeClass = `type-${task.type.toLowerCase()}`;

    return `
    <!DOCTYPE html>

    <html lang="en">

    <head>

      <meta charset="UTF-8">

      <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
      >

      <title>Task Details</title>

      <style>

        :root {
          ${taskTypeCssVars}
        }

        body {
          font-family:
            var(--vscode-font-family);

          color:
            var(--vscode-foreground);

          background:
            var(--vscode-editor-background);

          padding: 24px;

          max-width: 800px;

          margin: 0 auto;
        }

        .back-button {
          border: none;

          background: transparent;

          color:
            var(--vscode-textLink-foreground);

          cursor: pointer;

          padding: 0;

          margin-bottom: 24px;

          font-size: 13px;
        }

        .title {
          font-size: 24px;

          font-weight: 600;

          margin-bottom: 8px;
        }

        .type {
          display: inline-flex;
          align-items: center;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-bottom: 28px;
        }

        .type-todo {
          color: var(--codetasks-task-type-todo);
          background: color-mix(in srgb, var(--codetasks-task-type-todo) 12%, transparent);
        }

        .type-fixme {
          color: var(--codetasks-task-type-fixme);
          background: color-mix(in srgb, var(--codetasks-task-type-fixme) 12%, transparent);
        }

        .type-bug {
          color: var(--codetasks-task-type-bug);
          background: color-mix(in srgb, var(--codetasks-task-type-bug) 12%, transparent);
        }

        .type-hack {
          color: var(--codetasks-task-type-hack);
          background: color-mix(in srgb, var(--codetasks-task-type-hack) 12%, transparent);
        }

        .type-refactor {
          color: var(--codetasks-task-type-refactor);
          background: color-mix(in srgb, var(--codetasks-task-type-refactor) 12%, transparent);
        }

        .type-task {
          color: var(--codetasks-task-type-task);
          background: color-mix(in srgb, var(--codetasks-task-type-task) 12%, transparent);
        }

        .section {
          margin-bottom: 24px;
        }

        .label {
          display: block;

          font-size: 12px;

          color:
            var(--vscode-descriptionForeground);

          margin-bottom: 7px;
        }

        select,
        input,
        textarea {
          width: 100%;

          max-width: 500px;

          box-sizing: border-box;

          padding: 8px;

          background:
            var(--vscode-input-background);

          color:
            var(--vscode-input-foreground);

          border: 1px solid
            var(--vscode-input-border);

          border-radius: 4px;

          font-family:
            var(--vscode-font-family);
        }

        textarea {
          min-height: 120px;

          resize: vertical;
        }

        .description {
          white-space: pre-wrap;

          line-height: 1.5;

          color:
            var(--vscode-foreground);

          max-width: 700px;
        }

        .description.empty {
          color:
            var(--vscode-descriptionForeground);

          font-style: italic;
        }

        .location {
          padding: 12px;

          border: 1px solid
            var(--vscode-panel-border);

          border-radius: 6px;

          display: flex;

          flex-direction: column;

          gap: 4px;
        }

        .file {
          font-size: 13px;
        }

        .line {
          font-size: 12px;

          color:
            var(--vscode-descriptionForeground);
        }

        .dates {
          display: grid;

          grid-template-columns:
            repeat(2, minmax(0, 1fr));

          gap: 16px;
        }

        .date-value {
          font-size: 13px;
        }

        .divider {
          height: 1px;

          background:
            var(--vscode-panel-border);

          margin: 28px 0;
        }

        .button-row {
          display: flex;

          gap: 8px;

          align-items: center;

          flex-wrap: wrap;
        }

        button {
          font-family:
            var(--vscode-font-family);
        }

        .open-button,
        .edit-button,
        .save-button {
          padding: 8px 14px;

          border: none;

          border-radius: 4px;

          background:
            var(--vscode-button-background);

          color:
            var(--vscode-button-foreground);

          cursor: pointer;
        }

        .open-button:hover,
        .edit-button:hover,
        .save-button:hover {
          background:
            var(--vscode-button-hoverBackground);
        }

        .cancel-button {
          padding: 8px 14px;

          border: 1px solid
            var(--vscode-button-border);

          border-radius: 4px;

          background:
            var(--vscode-button-secondaryBackground);

          color:
            var(--vscode-button-secondaryForeground);

          cursor: pointer;
        }

        .cancel-button:hover {
          background:
            var(--vscode-button-secondaryHoverBackground);
        }

        .hidden {
          display: none;
        }

        select.updating,
        button.saving,
        button.archiving {
          opacity: 0.6;

          cursor: wait;
        }

        button:disabled {
          cursor: not-allowed;

          opacity: 0.6;
        }

        .success-message {
          margin-top: 16px;

          padding: 8px 10px;

          border-radius: 4px;

          background:
            var(--vscode-testing-iconPassed);

          color:
            var(--vscode-editor-background);
        }

        .error-message {
          margin-top: 8px;

          color:
            var(--vscode-errorForeground);

          font-size: 13px;
        }

        .archive-button {
          padding: 8px 14px;

          border: 1px solid
            var(--vscode-errorForeground);

          border-radius: 4px;

          background: transparent;

          color:
            var(--vscode-errorForeground);

          cursor: pointer;
        }

        .archive-button:hover {
          background:
            var(--vscode-toolbar-hoverBackground);
        }

        .archive-button:disabled {
          opacity: 0.6;

          cursor: wait;
        }

        .restore-button {
          padding: 8px 14px;

          border: 1px solid
            var(--vscode-charts-green);

          border-radius: 4px;

          background: transparent;

          color:
            var(--vscode-charts-green);

          cursor: pointer;
        }

        .restore-button:hover {
          background:
            var(--vscode-toolbar-hoverBackground);
        }

        .restore-button:disabled {
          opacity: 0.6;

          cursor: wait;
        }

      </style>

    </head>

    <body>

      <button
        class="back-button"
        id="back-button"
      >
        ← Back
      </button>


      <!-- ========================================= -->
      <!-- VIEW MODE -->
      <!-- ========================================= -->

      <div id="view-mode">

        <div
          class="title"
          id="task-title"
        >
          ${this.escapeHtml(task.title)}
        </div>


        <div class="type ${taskTypeClass}">
          ${this.escapeHtml(task.type)}
        </div>


        <!-- DESCRIPTION -->

        <div class="section">

          <label class="label">
            Description
          </label>

          <div
            class="description ${task.description ? "" : "empty"}"
            id="task-description"
          >
            ${
              task.description
                ? this.escapeHtml(task.description)
                : "No description added."
            }
          </div>

        </div>


        <!-- STATUS -->

        <div class="section">

          <label class="label">
            Status
          </label>

          <select id="status">

            <option
              value="open"
              ${task.status === "open" ? "selected" : ""}
            >
              Open
            </option>

            <option
              value="in-progress"
              ${task.status === "in-progress" ? "selected" : ""}
            >
              In Progress
            </option>

            <option
              value="blocked"
              ${task.status === "blocked" ? "selected" : ""}
            >
              Blocked
            </option>

            <option
              value="review"
              ${task.status === "review" ? "selected" : ""}
            >
              Review
            </option>

            <option
              value="done"
              ${task.status === "done" ? "selected" : ""}
            >
              Done
            </option>

          </select>

        </div>


        <!-- PRIORITY -->

        <div class="section">

          <label class="label">
            Priority
          </label>

          <select id="priority">

            <option
              value="low"
              ${task.priority === "low" ? "selected" : ""}
            >
              Low
            </option>

            <option
              value="medium"
              ${task.priority === "medium" ? "selected" : ""}
            >
              Medium
            </option>

            <option
              value="high"
              ${task.priority === "high" ? "selected" : ""}
            >
              High
            </option>

            <option
              value="critical"
              ${task.priority === "critical" ? "selected" : ""}
            >
              Critical
            </option>

          </select>

        </div>


        <!-- LOCATION -->

        <div class="section">

          <label class="label">
            Location
          </label>

          <div class="location">

            <div class="file">
              📄
              ${this.escapeHtml(
                task.filePath.split("/").pop() || task.filePath,
              )}
            </div>

            <div class="line">
              Line ${task.line + 1}
            </div>

          </div>

        </div>


        <div class="divider"></div>


        <!-- DATES -->

        <div class="section dates">

          <div>

            <span class="label">
              Created
            </span>

            <div
              class="date-value"
              id="created-at"
            >
              ${this.formatDate(task.createdAt)}
            </div>

          </div>


          <div>

            <span class="label">
              Updated
            </span>

            <div
              class="date-value"
              id="updated-at"
            >
              ${this.formatDate(task.updatedAt)}
            </div>

          </div>


          <div
            id="archived-date-section"
            style="${task.archivedAt ? "" : "display: none;"}"
          >

            <span class="label">
              Archived
            </span>

            <div
              class="date-value"
              id="archived-at"
            >
              ${
                task.archivedAt
                  ? this.formatDate(task.archivedAt)
                  : ""
              }
            </div>

          </div>

        </div>


        <!-- ACTIONS -->

        <div class="button-row">

          <button
            class="open-button"
            id="open-source"
            type="button"
          >
            Open Source File
          </button>


          <button
            class="archive-button"
            id="archive-task"
            type="button"
            ${task.archivedAt ? "disabled" : ""}
          >
            ${task.archivedAt ? "Archived" : "Archive Task"}
          </button>


          <button
            class="restore-button"
            id="unarchive-task"
            type="button"
            ${task.archivedAt ? "" : 'style="display: none;"'}
          >
            Restore Task
          </button>


          <button
            class="edit-button"
            id="edit-button"
            type="button"
          >
            Edit
          </button>

        </div>

      </div>


      <!-- ========================================= -->
      <!-- EDIT MODE -->
      <!-- ========================================= -->

      <div
        id="edit-mode"
        class="hidden"
      >

        <div class="section">

          <label
            class="label"
            for="edit-title"
          >
            Title
          </label>

          <input
            id="edit-title"
            type="text"
            value="${this.escapeHtml(task.title)}"
          />

        </div>


        <div class="section">

          <label
            class="label"
            for="edit-description"
          >
            Description
          </label>

          <textarea
            id="edit-description"
            placeholder="Add a description..."
          >${this.escapeHtml(task.description || "")}</textarea>

        </div>


        <div
          class="error-message hidden"
          id="edit-error"
        ></div>


        <div class="button-row">

          <button
            class="save-button"
            id="save-button"
            type="button"
          >
            Save
          </button>

          <button
            class="cancel-button"
            id="cancel-button"
            type="button"
          >
            Cancel
          </button>

        </div>

      </div>

      <script>

        /*
        * ==========================================================
        * VS CODE API
        * ==========================================================
        */

        const vscode = acquireVsCodeApi();


        /*
        * ==========================================================
        * DOM REFERENCES
        * ==========================================================
        */

        const backButton =
          document.getElementById("back-button");

        const openSourceButton =
          document.getElementById("open-source");

        const archiveButton =
          document.getElementById("archive-task");

        const unarchiveButton =
          document.getElementById("unarchive-task");

        const editButton =
          document.getElementById("edit-button");

        const saveButton =
          document.getElementById("save-button");

        const cancelButton =
          document.getElementById("cancel-button");

        const statusSelect =
          document.getElementById("status");

        const prioritySelect =
          document.getElementById("priority");

        const viewMode =
          document.getElementById("view-mode");

        const editMode =
          document.getElementById("edit-mode");

        const editTitle =
          document.getElementById("edit-title");

        const editDescription =
          document.getElementById("edit-description");

        const editError =
          document.getElementById("edit-error");


        /*
        * ==========================================================
        * BACK
        * ==========================================================
        */

        if (backButton) {

          backButton.addEventListener(
            "click",
            () => {

              vscode.postMessage({
                command: "back"
              });

            }
          );

        }


        /*
        * ==========================================================
        * OPEN SOURCE
        * ==========================================================
        */

        if (openSourceButton) {

          openSourceButton.addEventListener(
            "click",
            () => {

              vscode.postMessage({
                command: "openSource"
              });

            }
          );

        }


        /*
        * ==========================================================
        * EDIT MODE
        * ==========================================================
        */

        function enterEditMode() {

          if (!viewMode || !editMode) {
            return;
          }

          if (editError) {

            editError.textContent = "";

            editError.classList.add(
              "hidden"
            );

          }

          viewMode.classList.add(
            "hidden"
          );

          editMode.classList.remove(
            "hidden"
          );

          if (editTitle) {
            editTitle.focus();
          }

        }


        function exitEditMode() {

          if (!viewMode || !editMode) {
            return;
          }

          editMode.classList.add(
            "hidden"
          );

          viewMode.classList.remove(
            "hidden"
          );

          if (editError) {

            editError.textContent = "";

            editError.classList.add(
              "hidden"
            );

          }

        }


        if (editButton) {

          editButton.addEventListener(
            "click",
            () => {

              enterEditMode();

            }
          );

        }


        if (cancelButton) {

          cancelButton.addEventListener(
            "click",
            () => {

              exitEditMode();

            }
          );

        }


        /*
        * ==========================================================
        * SAVE TASK
        * ==========================================================
        */

        if (saveButton) {

          saveButton.addEventListener(
            "click",
            () => {

              if (!editTitle || !editDescription) {
                return;
              }

              const title =
                editTitle.value.trim();

              const description =
                editDescription.value.trim();


              if (!title) {

                if (editError) {

                  editError.textContent =
                    "Task title cannot be empty.";

                  editError.classList.remove(
                    "hidden"
                  );

                }

                editTitle.focus();

                return;
              }


              saveButton.disabled =
                true;

              saveButton.classList.add(
                "saving"
              );

              saveButton.textContent =
                "Saving...";


              vscode.postMessage({
                command: "saveTask",

                title,

                description
              });

            }
          );

        }


        /*
        * ==========================================================
        * ARCHIVE TASK
        * ==========================================================
        */

        if (archiveButton) {

          archiveButton.addEventListener(
            "click",
            () => {

              if (archiveButton.disabled) {
                return;
              }


              archiveButton.disabled =
                true;

              archiveButton.classList.add(
                "archiving"
              );

              archiveButton.textContent =
                "Archiving...";


              vscode.postMessage({
                command: "archiveTask"
              });

            }
          );

        }


        /*
        * ==========================================================
        * UNARCHIVE TASK
        * ==========================================================
        */

        if (unarchiveButton) {

          unarchiveButton.addEventListener(
            "click",
            () => {

              if (unarchiveButton.disabled) {
                return;
              }


              unarchiveButton.disabled =
                true;

              unarchiveButton.classList.add(
                "archiving"
              );

              unarchiveButton.textContent =
                "Restoring...";


              vscode.postMessage({
                command: "unarchiveTask"
              });

            }
          );

        }


        /*
        * ==========================================================
        * STATUS
        * ==========================================================
        */

        if (statusSelect) {

          statusSelect.addEventListener(
            "change",
            (event) => {

              const select =
                event.target;


              select.disabled =
                true;

              select.classList.add(
                "updating"
              );


              vscode.postMessage({
                command: "updateStatus",

                status: select.value
              });

            }
          );

        }


        /*
        * ==========================================================
        * PRIORITY
        * ==========================================================
        */

        if (prioritySelect) {

          prioritySelect.addEventListener(
            "change",
            (event) => {

              const select =
                event.target;


              select.disabled =
                true;

              select.classList.add(
                "updating"
              );


              vscode.postMessage({
                command: "updatePriority",

                priority: select.value
              });

            }
          );

        }


        /*
        * ==========================================================
        * UPDATED DATE
        * ==========================================================
        */

        function updateUpdatedAt(
          value
        ) {

          const updatedAt =
            document.getElementById(
              "updated-at"
            );


          if (!updatedAt) {
            return;
          }


          updatedAt.textContent =
            new Date(
              value
            ).toLocaleString();

        }


        /*
        * ==========================================================
        * SUCCESS MESSAGE
        * ==========================================================
        */

        function showMessage(
          text
        ) {

          let message =
            document.getElementById(
              "success-message"
            );


          if (!message) {

            message =
              document.createElement(
                "div"
              );

            message.id =
              "success-message";

            message.className =
              "success-message";

            document.body.appendChild(
              message
            );

          }


          message.textContent =
            text;


          setTimeout(
            () => {

              if (message) {
                message.remove();
              }

            },
            2500
          );

        }


        /*
        * ==========================================================
        * UPDATE VIEW
        * ==========================================================
        */

        function updateView(
          updatedTask
        ) {

          if (!updatedTask) {
            return;
          }


          const title =
            document.getElementById(
              "task-title"
            );

          const description =
            document.getElementById(
              "task-description"
            );

          const status =
            document.getElementById(
              "status"
            );

          const priority =
            document.getElementById(
              "priority"
            );


          if (title) {

            title.textContent =
              updatedTask.title;

          }


          if (description) {

            if (
              updatedTask.description
            ) {

              description.textContent =
                updatedTask.description;

              description.classList.remove(
                "empty"
              );

            } else {

              description.textContent =
                "No description added.";

              description.classList.add(
                "empty"
              );

            }

          }


          if (status) {

            status.value =
              updatedTask.status;

            status.disabled =
              false;

            status.classList.remove(
              "updating"
            );

          }


          if (priority) {

            priority.value =
              updatedTask.priority;

            priority.disabled =
              false;

            priority.classList.remove(
              "updating"
            );

          }


          if (archiveButton) {

            if (updatedTask.archivedAt) {

              archiveButton.disabled = true;
              archiveButton.classList.remove(
                "archiving"
              );
              archiveButton.textContent =
                "Archived";

            } else {

              archiveButton.disabled = false;
              archiveButton.classList.remove(
                "archiving"
              );
              archiveButton.textContent =
                "Archive Task";

            }

          }


          const archivedDateSection =
            document.getElementById(
              "archived-date-section"
            );


          const archivedAt =
            document.getElementById(
              "archived-at"
            );


          if (archivedDateSection && archivedAt) {

            if (updatedTask.archivedAt) {

              archivedDateSection.style.display = "";
              archivedAt.textContent =
                new Date(
                  updatedTask.archivedAt
                ).toLocaleString();

            } else {

              archivedDateSection.style.display =
                "none";
              archivedAt.textContent = "";

            }

          }


          if (unarchiveButton) {

            if (updatedTask.archivedAt) {

              unarchiveButton.style.display = "";
              unarchiveButton.disabled = false;
              unarchiveButton.classList.remove(
                "archiving"
              );
              unarchiveButton.textContent =
                "Restore Task";

            } else {

              unarchiveButton.style.display = "none";
              unarchiveButton.disabled = false;
              unarchiveButton.classList.remove(
                "archiving"
              );
              unarchiveButton.textContent =
                "Restore Task";

            }

          }


          if (editTitle) {

            editTitle.value =
              updatedTask.title;

          }


          if (editDescription) {

            editDescription.value =
              updatedTask.description ||
              "";

          }


          updateUpdatedAt(
            updatedTask.updatedAt
          );

        }


        /*
        * ==========================================================
        * MESSAGE HANDLER
        * ==========================================================
        */

        window.addEventListener(
          "message",
          (event) => {

            const message =
              event.data;


            /*
            * --------------------------------------------------------
            * STATUS UPDATED
            * --------------------------------------------------------
            */

            if (
              message.command ===
              "statusUpdated"
            ) {

              if (statusSelect) {

                statusSelect.value =
                  message.status;

                statusSelect.disabled =
                  false;

                statusSelect.classList.remove(
                  "updating"
                );

              }


              updateUpdatedAt(
                message.updatedAt
              );


              showMessage(
                "Status updated successfully."
              );

              return;
            }


            /*
            * --------------------------------------------------------
            * STATUS FAILED
            * --------------------------------------------------------
            */

            if (
              message.command ===
              "statusUpdateFailed"
            ) {

              if (statusSelect) {

                statusSelect.disabled =
                  false;

                statusSelect.classList.remove(
                  "updating"
                );

              }


              showMessage(
                "Failed to update status."
              );

              return;
            }


            /*
            * --------------------------------------------------------
            * PRIORITY UPDATED
            * --------------------------------------------------------
            */

            if (
              message.command ===
              "priorityUpdated"
            ) {

              if (prioritySelect) {

                prioritySelect.value =
                  message.priority;

                prioritySelect.disabled =
                  false;

                prioritySelect.classList.remove(
                  "updating"
                );

              }


              updateUpdatedAt(
                message.updatedAt
              );


              showMessage(
                "Priority updated successfully."
              );

              return;
            }


            /*
            * --------------------------------------------------------
            * PRIORITY FAILED
            * --------------------------------------------------------
            */

            if (
              message.command ===
              "priorityUpdateFailed"
            ) {

              if (prioritySelect) {

                prioritySelect.disabled =
                  false;

                prioritySelect.classList.remove(
                  "updating"
                );

              }


              showMessage(
                "Failed to update priority."
              );

              return;
            }


            /*
            * --------------------------------------------------------
            * TASK SAVED
            * --------------------------------------------------------
            */

            if (
              message.command ===
              "taskSaved"
            ) {

              updateView(
                message.task
              );


              exitEditMode();


              if (saveButton) {

                saveButton.disabled =
                  false;

                saveButton.classList.remove(
                  "saving"
                );

                saveButton.textContent =
                  "Save";

              }


              showMessage(
                "Task updated successfully."
              );

              return;
            }


            /*
            * --------------------------------------------------------
            * SAVE FAILED
            * --------------------------------------------------------
            */

            if (
              message.command ===
              "saveTaskFailed"
            ) {

              if (saveButton) {

                saveButton.disabled =
                  false;

                saveButton.classList.remove(
                  "saving"
                );

                saveButton.textContent =
                  "Save";

              }


              if (editError) {

                editError.textContent =
                  message.error ||
                  "Failed to save task.";

                editError.classList.remove(
                  "hidden"
                );

              }

              return;
            }


            /*
            * --------------------------------------------------------
            * TASK UPDATED
            * --------------------------------------------------------
            */

            if (
              message.command ===
              "taskUpdated"
            ) {

              updateView(
                message.task
              );

              return;
            }


            /*
            * --------------------------------------------------------
            * TASK ARCHIVED
            * --------------------------------------------------------
            */

            if (
              message.command ===
              "taskArchived"
            ) {

              if (archiveButton) {

                archiveButton.disabled =
                  true;

                archiveButton.classList.remove(
                  "archiving"
                );

                archiveButton.textContent =
                  "Archived";

              }


              showMessage(
                "Task archived successfully."
              );


              setTimeout(
                () => {

                  vscode.postMessage({
                    command: "back"
                  });

                },
                700
              );


              return;
            }


            /*
            * --------------------------------------------------------
            * ARCHIVE CANCELLED
            * --------------------------------------------------------
            */

            if (
              message.command ===
              "archiveCancelled"
            ) {

              if (archiveButton) {

                archiveButton.disabled =
                  false;

                archiveButton.classList.remove(
                  "archiving"
                );

                archiveButton.textContent =
                  "Archive Task";

              }


              return;
            }


            /*
            * --------------------------------------------------------
            * ARCHIVE FAILED
            * --------------------------------------------------------
            */

            if (
              message.command ===
              "archiveTaskFailed"
            ) {

              if (archiveButton) {

                archiveButton.disabled =
                  false;

                archiveButton.classList.remove(
                  "archiving"
                );

                archiveButton.textContent =
                  "Archive Task";

              }


              showMessage(
                message.error ||
                "Failed to archive task."
              );


              return;
            }


            /*
            * --------------------------------------------------------
            * TASK UNARCHIVED
            * --------------------------------------------------------
            */

            if (
              message.command ===
              "taskUnarchived"
            ) {

              if (archiveButton) {

                archiveButton.disabled =
                  false;

                archiveButton.classList.remove(
                  "archiving"
                );

                archiveButton.textContent =
                  "Archive Task";

              }


              if (unarchiveButton) {

                unarchiveButton.disabled =
                  false;

                unarchiveButton.classList.remove(
                  "archiving"
                );

                unarchiveButton.textContent =
                  "Restore Task";

                unarchiveButton.style.display =
                  "none";

              }


              showMessage(
                "Task restored successfully."
              );

              return;
            }


            /*
            * --------------------------------------------------------
            * UNARCHIVE FAILED
            * --------------------------------------------------------
            */

            if (
              message.command ===
              "unarchiveTaskFailed"
            ) {

              if (unarchiveButton) {

                unarchiveButton.disabled =
                  false;

                unarchiveButton.classList.remove(
                  "archiving"
                );

                unarchiveButton.textContent =
                  "Restore Task";

              }


              showMessage(
                message.error ||
                "Failed to restore task."
              );

              return;
            }

          }
        );

      </script>


    </body>

    </html>
  `;
  }

  private formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
