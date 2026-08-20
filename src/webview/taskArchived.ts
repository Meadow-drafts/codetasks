import * as vscode from "vscode";
import { CodeTask } from "../models/task";
import { TaskStore } from "../store/taskStore";
import { buildTaskTypeCssVariables } from "../theme/taskTypeColors";

export class TaskArchivedProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly taskStore: TaskStore,
  ) {}

  private formatStatus(status: CodeTask["status"]): string {
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

  private formatPriority(priority: CodeTask["priority"]): string {
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

  open(): void {
    const panel = vscode.window.createWebviewPanel(
      "codetasks.archivedTasks",
      "Archived Tasks",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
      },
    );

    const postArchivedSnapshot = () => {
      const tasks = this.taskStore.getArchivedTasks();

      void panel.webview.postMessage({
        command: "tasksUpdated",
        tasks,
      });
    };

    const storeChangeSubscription = this.taskStore.onDidChange(() => {
      postArchivedSnapshot();
    });

    panel.onDidDispose(() => {
      storeChangeSubscription.dispose();
    });

    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "requestTasksSync") {
        postArchivedSnapshot();
        return;
      }

      if (message.command === "openTask") {
        const task = this.taskStore
          .getArchivedTasks()
          .find((currentTask) => currentTask.id === message.taskId);

        if (!task) {
          return;
        }

        const document = await vscode.workspace.openTextDocument(task.filePath);
        const editor = await vscode.window.showTextDocument(document);
        const position = new vscode.Position(task.line, 0);

        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter,
        );

        return;
      }

      if (message.command === "restoreTask") {
        const task = this.taskStore
          .getArchivedTasks()
          .find((currentTask) => currentTask.id === message.taskId);

        if (!task) {
          panel.webview.postMessage({
            command: "restoreTaskFailed",
            taskId: message.taskId,
          });

          return;
        }

        const updated = await this.taskStore.unarchiveTask(task.id);

        if (!updated) {
          panel.webview.postMessage({
            command: "restoreTaskFailed",
            taskId: task.id,
          });

          vscode.window.showErrorMessage("CodeTasks: Failed to restore task.");

          return;
        }

        vscode.window.showInformationMessage(
          `Task "${task.title}" restored.`,
        );

        return;
      }

      if (message.command === "openTaskDetails") {
        vscode.commands.executeCommand(
          "codetasks.openTaskDetails",
          message.taskId,
        );
      }
    });

    panel.webview.html = this.getHtml();
  }

  private getHtml(): string {
    const tasks = this.taskStore.getArchivedTasks();
    const taskTypeCssVars = buildTaskTypeCssVariables();

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Archived Tasks</title>
      <style>
        :root {
          ${taskTypeCssVars}
        }

        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 24px;
            max-width: 1100px;
            margin: 0 auto;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            margin-bottom: 18px;
            flex-wrap: wrap;
          }
          .title {
            font-size: 22px;
            font-weight: 600;
          }
          .subtitle {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
          }
          .count {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
          }
          .refresh-button {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            padding: 7px 10px;
            cursor: pointer;
          }
          .refresh-button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
          }
          .refresh-button:disabled {
            opacity: 0.6;
            cursor: wait;
          }
          .toolbar {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
            flex-wrap: wrap;
          }
          input,
          select {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 7px 10px;
          }
          input {
            flex: 1;
            min-width: 180px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            text-align: left;
            padding: 10px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            vertical-align: top;
          }
          th {
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
          }
          tr:hover {
            background: var(--vscode-list-hoverBackground);
          }
          .task-row {
            cursor: pointer;
          }
          .task-row.hidden {
            display: none;
          }
          .meta {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .file {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
          }
          .task-assignee {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            margin-top: 4px;
          }
          .badge {
            display: inline-flex;
            align-items: center;
            padding: 2px 7px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            margin-right: 6px;
          }
          .status {
            color: var(--vscode-charts-blue);
            background: color-mix(in srgb, var(--vscode-charts-blue) 12%, transparent);
          }
          .priority-low {
            color: var(--vscode-testing-iconPassed);
            background: color-mix(in srgb, var(--vscode-testing-iconPassed) 12%, transparent);
          }
          .priority-medium {
            color: var(--vscode-charts-blue);
            background: color-mix(in srgb, var(--vscode-charts-blue) 12%, transparent);
          }
          .priority-high {
            color: var(--vscode-charts-orange);
            background: color-mix(in srgb, var(--vscode-charts-orange) 12%, transparent);
          }
          .priority-critical {
            color: var(--vscode-errorForeground);
            background: color-mix(in srgb, var(--vscode-errorForeground) 12%, transparent);
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
          .actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }
          button {
            font-family: var(--vscode-font-family);
            border: none;
            border-radius: 4px;
            padding: 6px 10px;
            cursor: pointer;
          }
          .restore-button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
          }
          .restore-button:hover {
            background: var(--vscode-button-hoverBackground);
          }
          .open-button {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
          }
          .open-button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
          }
          .empty {
            padding: 36px 12px;
            color: var(--vscode-descriptionForeground);
            border: 1px dashed var(--vscode-panel-border);
            border-radius: 8px;
            text-align: center;
          }
          .loading {
            opacity: 0.6;
            cursor: wait;
          }
          @media (max-width: 760px) {
            body {
              padding: 16px;
            }
            table, thead, tbody, th, td, tr {
              display: block;
            }
            thead {
              display: none;
            }
            tr {
              border: 1px solid var(--vscode-panel-border);
              border-radius: 8px;
              margin-bottom: 12px;
              overflow: hidden;
            }
            td {
              border-bottom: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">Archived Tasks</div>
            <div class="subtitle">Restore tasks to bring them back into active lists.</div>
          </div>
          <div class="count">${tasks.length} archived task(s)</div>
        </div>

        <div class="toolbar">
          <button id="refresh-tasks" class="refresh-button" type="button">↻ Refresh</button>
        </div>

        <div class="toolbar">
          <input
            id="task-search"
            type="search"
            placeholder="Search archived tasks..."
          />

          <select id="status-filter">
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="in-progress">In Progress</option>
            <option value="blocked">Blocked</option>
            <option value="review">Review</option>
            <option value="done">Done</option>
          </select>

          <select id="type-filter">
            <option value="all">All types</option>
            <option value="TODO">TODO</option>
            <option value="FIXME">FIXME</option>
            <option value="BUG">BUG</option>
            <option value="HACK">HACK</option>
            <option value="REFACTOR">REFACTOR</option>
            <option value="TASK">TASK</option>
          </select>

          <select id="priority-filter">
            <option value="all">All priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>

          <select id="sort-filter">
            <option value="archived-desc">Recently archived</option>
            <option value="archived-asc">Least recently archived</option>
            <option value="updated-desc">Recently updated</option>
            <option value="updated-asc">Least recently updated</option>
            <option value="title-asc">Title A-Z</option>
            <option value="title-desc">Title Z-A</option>
          </select>
        </div>

        <div id="content"></div>

        <script>
          const vscode = acquireVsCodeApi();
          const content = document.getElementById("content");
          const searchInput = document.getElementById("task-search");
          const statusFilter = document.getElementById("status-filter");
          const typeFilter = document.getElementById("type-filter");
          const priorityFilter = document.getElementById("priority-filter");
          const sortFilter = document.getElementById("sort-filter");
          const count = document.querySelector(".count");
          const refreshButton = document.getElementById("refresh-tasks");

          let currentTasks = [];

          function escapeHtml(value) {
            return String(value)
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
          }

          function compareDates(a, b) {
            return new Date(a).getTime() - new Date(b).getTime();
          }

          function formatStatus(status) {
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

          function formatPriority(priority) {
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

          function updateCount(visibleCount) {
            if (!count) {
              return;
            }

            count.textContent =
              visibleCount + " / " + currentTasks.length + " archived task(s)";
          }

          function buildTaskRowHtml(task) {
            return [
              '<tr class="task-row" data-task-id="' + escapeHtml(task.id) + '"',
              ' data-title="' + escapeHtml(task.title.toLowerCase()) + '"',
              ' data-status="' + escapeHtml(task.status) + '"',
              ' data-type="' + escapeHtml(task.type) + '"',
              ' data-priority="' + escapeHtml(task.priority) + '"',
              ' data-archived-at="' + escapeHtml(task.archivedAt || "") + '"',
              ' data-updated-at="' + escapeHtml(task.updatedAt) + '"',
              ' data-created-at="' + escapeHtml(task.createdAt) + '">',
              '<td>',
              '<div>' + escapeHtml(task.title) + '</div>',
              task.assignee
                ? '<div class="task-assignee">Assignee: ' + escapeHtml(task.assignee) + '</div>'
                : '',
              '<div class="file">' + escapeHtml(task.filePath) + ":" + (task.line + 1) + '</div>',
              "</td>",
              "<td>",
              '<span class="badge status">' + escapeHtml(formatStatus(task.status)) + '</span>',
              '<span class="badge priority-' + escapeHtml(task.priority) + '">' + escapeHtml(formatPriority(task.priority)) + '</span>',
              '<div class="file">Type: <span class="badge type-badge type-' + escapeHtml(task.type.toLowerCase()) + '">' + escapeHtml(task.type) + '</span></div>',
              "</td>",
              '<td>' + escapeHtml(task.archivedAt ? new Date(task.archivedAt).toLocaleString() : "") + '</td>',
              "<td>",
              '<div class="actions">',
              '<button class="open-button" data-action="open" data-task-id="' + escapeHtml(task.id) + '">Open Source</button>',
              '<button class="restore-button" data-action="restore" data-task-id="' + escapeHtml(task.id) + '">Restore</button>',
              "</div>",
              "</td>",
              "</tr>",
            ].join("");
          }

          function renderRows(tasks) {
            currentTasks = [...tasks];

            if (!content) {
              return;
            }

            if (!tasks.length) {
              content.innerHTML = '<div class="empty">No archived tasks right now.</div>';
              updateCount(0);
              return;
            }

            content.innerHTML = [
              '<table>',
              '<thead><tr><th>Task</th><th>Details</th><th>Archived</th><th>Actions</th></tr></thead>',
              '<tbody>',
              tasks.map((task) => buildTaskRowHtml(task)).join(''),
              '</tbody>',
              '</table>',
            ].join('');

            bindRows();
            filterTasks();

            if (refreshButton) {
              refreshButton.disabled = false;
              refreshButton.textContent = "↻ Refresh";
            }
          }

          function bindRows() {
            content.querySelectorAll('.task-row').forEach((row) => {
              row.addEventListener('click', () => {
                const taskId = row.dataset.taskId;
                if (!taskId) {
                  return;
                }
                vscode.postMessage({ command: 'openTask', taskId });
              });
            });

            content.querySelectorAll('[data-action="open"]').forEach((button) => {
              button.addEventListener('click', (event) => {
                event.stopPropagation();
                vscode.postMessage({
                  command: 'openTask',
                  taskId: button.dataset.taskId,
                });
              });
            });

            content.querySelectorAll('[data-action="restore"]').forEach((button) => {
              button.addEventListener('click', (event) => {
                event.stopPropagation();
                button.classList.add('loading');
                button.disabled = true;
                vscode.postMessage({
                  command: 'restoreTask',
                  taskId: button.dataset.taskId,
                });
              });
            });
          }

          function filterTasks() {
            const search = (searchInput && "value" in searchInput ? searchInput.value : "")
              .trim()
              .toLowerCase();
            const selectedStatus = statusFilter && "value" in statusFilter ? statusFilter.value : "all";
            const selectedType = typeFilter && "value" in typeFilter ? typeFilter.value : "all";
            const selectedPriority = priorityFilter && "value" in priorityFilter ? priorityFilter.value : "all";
            const selectedSort = sortFilter && "value" in sortFilter ? sortFilter.value : "archived-desc";

            const rows = Array.from(content?.querySelectorAll(".task-row") ?? []);

            rows.forEach((row) => {
              const title = row.dataset.title || "";
              const status = row.dataset.status || "";
              const type = row.dataset.type || "";
              const priority = row.dataset.priority || "";
              const visible =
                (!search || title.includes(search)) &&
                (selectedStatus === "all" || status === selectedStatus) &&
                (selectedType === "all" || type === selectedType) &&
                (selectedPriority === "all" || priority === selectedPriority);

              row.classList.toggle("hidden", !visible);
            });

            rows.sort((a, b) => {
              switch (selectedSort) {
                case "archived-desc":
                  return compareDates(b.dataset.archivedAt || "", a.dataset.archivedAt || "");
                case "archived-asc":
                  return compareDates(a.dataset.archivedAt || "", b.dataset.archivedAt || "");
                case "updated-desc":
                  return compareDates(b.dataset.updatedAt || "", a.dataset.updatedAt || "");
                case "updated-asc":
                  return compareDates(a.dataset.updatedAt || "", b.dataset.updatedAt || "");
                case "title-asc":
                  return (a.dataset.title || "").localeCompare(b.dataset.title || "");
                case "title-desc":
                  return (b.dataset.title || "").localeCompare(a.dataset.title || "");
                default:
                  return 0;
              }
            });

            const tbody = content?.querySelector("tbody");
            if (tbody) {
              rows.forEach((row) => tbody.appendChild(row));
            }

            updateCount(rows.filter((row) => !row.classList.contains("hidden")).length);
          }

          window.addEventListener('message', (event) => {
            const message = event.data;

            if (message.command === 'tasksUpdated') {
              renderRows(message.tasks || []);
              return;
            }

            if (message.command === 'restoreTaskFailed') {
              const button = document.querySelector(
                '[data-action="restore"][data-task-id="' + message.taskId + '"]'
              );
              if (button) {
                button.disabled = false;
                button.classList.remove('loading');
              }
            }
          });

          window.addEventListener('focus', () => {
            vscode.postMessage({ command: 'requestTasksSync' });
          });

          window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
              vscode.postMessage({ command: 'requestTasksSync' });
            }
          });

          if (searchInput) {
            searchInput.addEventListener("input", filterTasks);
          }

          if (statusFilter) {
            statusFilter.addEventListener("change", filterTasks);
          }

          if (typeFilter) {
            typeFilter.addEventListener("change", filterTasks);
          }

          if (priorityFilter) {
            priorityFilter.addEventListener("change", filterTasks);
          }

          if (sortFilter) {
            sortFilter.addEventListener("change", filterTasks);
          }

          if (refreshButton) {
            refreshButton.addEventListener("click", () => {
              refreshButton.disabled = true;
              refreshButton.textContent = "Refreshing...";
              vscode.postMessage({ command: "requestTasksSync" });
            });
          }

          renderRows(${JSON.stringify(tasks)});
        </script>
      </body>
      </html>
    `;
  }
}
