import * as vscode from "vscode";
import { TaskStore } from "../store/taskStore";
import { CodeTask } from "../models/task";

export class TaskWorkspaceProvider {
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
    let currentView: "table" | "kanban" = "table";

    const panel = vscode.window.createWebviewPanel(
      "codetasks.workspace",
      "CodeTasks",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
      },
    );

    const postWorkspaceSnapshot = () => {
      const stats = this.taskStore.getTaskStats();
      const tasks = this.taskStore.getActiveTasks();

      void panel.webview.postMessage({
        command: "statsUpdated",
        stats,
      });

      void panel.webview.postMessage({
        command: "tasksUpdated",
        tasks,
      });
    };

    const storeChangeSubscription = this.taskStore.onDidChange(() => {
      postWorkspaceSnapshot();
    });

    panel.onDidDispose(() => {
      storeChangeSubscription.dispose();
    });

    panel.webview.onDidReceiveMessage(
      async (message) => {
        console.log("CodeTasks Webview message:", message);
        if (message.command === "setView") {
          currentView = message.view;
          return;
        }
        if (message.command === "requestTasksSync") {
          postWorkspaceSnapshot();
          return;
        }
        if (message.command === "openTask") {
          const task = this.taskStore
            .getActiveTasks()
            .find((task) => task.id === message.taskId);

          if (!task) {
            console.error("CodeTasks: Task not found:", message.taskId);

            return;
          }

          const document = await vscode.workspace.openTextDocument(
            task.filePath,
          );

          const editor = await vscode.window.showTextDocument(document);

          const position = new vscode.Position(task.line, 0);

          editor.selection = new vscode.Selection(position, position);

          editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter,
          );

          return;
        }

        if (message.command === "updateStatus") {
          const updated = await this.taskStore.updateTaskStatus(
            message.taskId,
            message.status,
          );

          if (!updated) {
            vscode.window.showErrorMessage(
              "CodeTasks: Could not update task status.",
            );

            panel.webview.postMessage({
              command: "statusUpdateFailed",
              taskId: message.taskId,
            });

            return;
          }

          const task = this.taskStore
            .getActiveTasks()
            .find((task) => task.id === message.taskId);

          if (!task) {
            return;
          }

          vscode.window.showInformationMessage(
            `Task "${task.title}" marked as ${this.formatStatus(task.status)}.`,
          );

          panel.webview.postMessage({
            command: "statusUpdated",
            taskId: task.id,
            status: task.status,
          });

          return;
        }
        if (message.command === "openTaskDetails") {
          vscode.commands.executeCommand(
            "codetasks.openTaskDetails",
            message.taskId,
          );

          return;
        }
        if (message.command === "updatePriority") {
          const updated = await this.taskStore.updateTaskPriority(
            message.taskId,
            message.priority,
          );

          if (!updated) {
            vscode.window.showErrorMessage(
              "CodeTasks: Could not update task priority.",
            );

            panel.webview.postMessage({
              command: "priorityUpdateFailed",
              taskId: message.taskId,
            });

            return;
          }

          const task = this.taskStore
            .getActiveTasks()
            .find((task) => task.id === message.taskId);

          if (!task) {
            return;
          }

          vscode.window.showInformationMessage(
            `Task "${task.title}" priority updated to ${this.formatPriority(task.priority)}.`,
          );

          panel.webview.postMessage({
            command: "priorityUpdated",
            taskId: task.id,
            priority: task.priority,
          });

          return;
        }
        if (message.command === "refreshTasks") {
          await vscode.commands.executeCommand("codetasks.refreshTasks");

          panel.webview.postMessage({
            command: "tasksRefreshed",
          });

          return;
        }
      },
      undefined,
      [],
    );

    panel.webview.html = this.getHtml(currentView);
  }

  private getHtml(currentView: "table" | "kanban" = "table"): string {
    const tasks = this.taskStore.getActiveTasks();
    const stats = this.taskStore.getTaskStats();
    const statusCounts = {
      open: tasks.filter((task) => task.status === "open").length,

      "in-progress": tasks.filter((task) => task.status === "in-progress")
        .length,

      blocked: tasks.filter((task) => task.status === "blocked").length,

      review: tasks.filter((task) => task.status === "review").length,

      done: tasks.filter((task) => task.status === "done").length,
    };

    const priorityCounts = {
      low: tasks.filter((task) => task.priority === "low").length,

      medium: tasks.filter((task) => task.priority === "medium").length,

      high: tasks.filter((task) => task.priority === "high").length,

      critical: tasks.filter((task) => task.priority === "critical").length,
    };
    const rows = tasks
      .map(
        (task) => `
			<tr
					class="task-row"
					data-task-id="${this.escapeHtml(task.id)}"
					data-title="${this.escapeHtml(task.title.toLowerCase())}"
					data-status="${task.status}"
					data-type="${task.type}"
					data-priority="${task.priority}"
					data-created-at="${this.escapeHtml(task.createdAt)}"
					data-updated-at="${this.escapeHtml(task.updatedAt)}"
					data-file-name="${this.escapeHtml(
            vscode.Uri.file(task.filePath).fsPath.split("/").pop() || "",
          )}"
					data-line="${task.line + 1}"
				>
								<td>
									${this.escapeHtml(task.title)}
								</td>

								<td>
									${task.type}
								</td>

								<td>
								<select
								class="status-select"
								data-task-id="${this.escapeHtml(task.id)}"
								data-current-status="${task.status}"
							>
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
				</td>
				<td>
					<select
						class="priority-select"
						data-task-id="${this.escapeHtml(task.id)}"
						data-current-priority="${task.priority}"
					>
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
				</td>

								<td>
									${this.escapeHtml(task.filePath)}:${task.line + 1}
								</td>
							</tr>
		`,
      )
      .join("");

    return `
			<!DOCTYPE html>

			<html lang="en">

			<head>
				<meta charset="UTF-8">

				<meta
					name="viewport"
					content="width=device-width, initial-scale=1.0"
				>

				<title>CodeTasks</title>

				<style>
					body {
						font-family: var(
							--vscode-font-family
						);

						color: var(
							--vscode-foreground
						);

						background: var(
							--vscode-editor-background
						);

						padding: 24px;
					}

					.header {
						display: flex;
						justify-content: space-between;
						align-items: center;
						margin-bottom: 20px;
					}

					.title {
						font-size: 20px;
						font-weight: 600;
					}

					.count {
						color: var(
							--vscode-descriptionForeground
						);
					}

					.toolbar {
						display: flex;
						gap: 8px;
						margin-bottom: 16px;
					}
					.status-select {
						background: var(--vscode-dropdown-background);
						color: var(--vscode-dropdown-foreground);
						border: 1px solid var(--vscode-dropdown-border);
						padding: 4px 8px;
						border-radius: 3px;
						cursor: pointer;
					}
					input,
					select {
						background: var(
							--vscode-input-background
						);

						color: var(
							--vscode-input-foreground
						);

						border: 1px solid var(
							--vscode-input-border
						);

						padding: 7px 10px;
					}

					input {
						flex: 1;
					}

					table {
						width: 100%;
						border-collapse: collapse;
					}

					th,
					td {
						text-align: left;
						padding: 10px;
						border-bottom: 1px solid var(
							--vscode-panel-border
						);
					}

					th {
						color: var(
							--vscode-descriptionForeground
						);

						font-weight: 500;
					}

					tr:hover {
						background: var(
							--vscode-list-hoverBackground
						);
					}
					.task-row {
						cursor: pointer;
					}

					.task-row:hover {
						background: var(--vscode-list-hoverBackground);
					}
						.status-select.updating {
						opacity: 0.6;
						cursor: wait;
					}

					.status-select.updating {
						opacity: 0.6;
						cursor: wait;
					}

					.status-select.updating,
					.priority-select.updating {
						opacity: 0.6;
						cursor: wait;
					}

						.count {
						display: flex;
						align-items: center;
						gap: 6px;
						color: var(--vscode-descriptionForeground);
						font-size: 13px;
					}

					.separator {
						opacity: 0.5;
					}
					.priority-summary {
						display: flex;
						align-items: center;
						gap: 6px;
						color: var(--vscode-descriptionForeground);
						font-size: 13px;
						margin-left: 16px;
					}
						.refresh-button {
						background: var(--vscode-button-secondaryBackground);
						color: var(--vscode-button-secondaryForeground);
						border: none;
						padding: 6px 10px;
						border-radius: 4px;
						cursor: pointer;
					}

					.refresh-button:hover {
						background: var(--vscode-button-secondaryHoverBackground);
					}
						.view-toggle {
						display: flex;
						gap: 4px;
					}

					.view-button {
						background: transparent;
						color: var(--vscode-foreground);
						border: 1px solid var(--vscode-panel-border);
						padding: 6px 10px;
						cursor: pointer;
					}

					.view-button:hover {
						background: var(--vscode-list-hoverBackground);
					}

					.view-button.active {
						background: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
					}


					.kanban-view {
						width: 100%;
						overflow-x: auto;
					}


					.kanban-board {
						display: grid;
						grid-template-columns:
							repeat(5, minmax(220px, 1fr));

						gap: 12px;

						min-width: 1100px;
					}


					.kanban-column {
						background:
							var(--vscode-sideBar-background);

						border:
							1px solid
							var(--vscode-panel-border);

						border-radius: 6px;

						min-height: 400px;
					}


					.kanban-column-header {
						display: flex;

						justify-content:
							space-between;

						align-items: center;

						padding: 10px 12px;

						font-weight: 600;

						border-bottom:
							1px solid
							var(--vscode-panel-border);
					}


					.kanban-count {
						color:
							var(--vscode-descriptionForeground);

						font-size: 12px;
					}


					.kanban-cards {
						display: flex;

						flex-direction: column;

						gap: 8px;

						padding: 8px;
					}

	  				.kanban-card {
					padding: 12px;

					border: 1px solid
						var(--vscode-panel-border);

					border-radius: 6px;

					background:
						var(--vscode-editor-background);

					cursor: grab;

					transition:
						transform 0.12s ease,
						border-color 0.12s ease,
						box-shadow 0.12s ease;
				}


				.kanban-card:hover {
					border-color:
						var(--vscode-focusBorder);

					box-shadow:
						0 2px 8px
						rgba(0, 0, 0, 0.15);

					transform:
						translateY(-1px);
				}


				.kanban-card:active {
					cursor: grabbing;
				}


				.kanban-card.dragging {
					opacity: 0.5;

					transform:
						rotate(1deg);
				}
	
				.kanban-card-title {
					font-size: 14px;

					font-weight: 500;

					line-height: 1.4;

					margin-bottom: 10px;

					word-break: break-word;
				}

				.kanban-card-meta {
					display: flex;

					align-items: center;

					justify-content: space-between;

					gap: 8px;

					margin-bottom: 10px;
				}


				.task-type-badge,
				.priority-badge {
					display: inline-flex;

					align-items: center;

					padding: 2px 7px;

					border-radius: 999px;

					font-size: 11px;

					font-weight: 600;

					text-transform: uppercase;
				}

	  			.priority-low {
					color:
						var(--vscode-testing-iconPassed);

					background:
						color-mix(
							in srgb,
							var(--vscode-testing-iconPassed) 12%,
							transparent
						);
				}


				.priority-medium {
					color:
						var(--vscode-charts-blue);

					background:
						color-mix(
							in srgb,
							var(--vscode-charts-blue) 12%,
							transparent
						);
				}


				.priority-high {
					color:
						var(--vscode-charts-orange);

					background:
						color-mix(
							in srgb,
							var(--vscode-charts-orange) 12%,
							transparent
						);
				}


				.priority-critical {
					color:
						var(--vscode-errorForeground);

					background:
						color-mix(
							in srgb,
							var(--vscode-errorForeground) 12%,
							transparent
						);
				}
					

				.kanban-empty {
					color:
						var(--vscode-descriptionForeground);

					text-align: center;

					padding: 20px 10px;

					font-size: 12px;
				}
					


				.kanban-column.drag-over {
					border-color:
						var(--vscode-focusBorder);

					background:
						var(--vscode-list-hoverBackground);
				}
				
				.type-todo {
					color:
						var(--vscode-charts-blue);
				}


				.type-fixme {
					color:
						var(--vscode-charts-orange);
				}


				.type-bug {
					color:
						var(--vscode-errorForeground);
				}


				.type-hack {
					color:
						var(--vscode-charts-purple);
				}


				.type-refactor {
					color:
						var(--vscode-charts-green);
				}


				.type-task {
					color:
						var(--vscode-descriptionForeground);
				}
				
				.kanban-card-location {
					display: flex;

					align-items: center;

					gap: 5px;

					color:
						var(--vscode-descriptionForeground);

					font-size: 11px;

					white-space: nowrap;

					overflow: hidden;

					text-overflow: ellipsis;
				}


				.kanban-card-location
				.codicon {
					flex-shrink: 0;
				}


				.kanban-card-line {
					opacity: 0.7;

					flex-shrink: 0;
				}
				
				.stats {
					display: grid;

					grid-template-columns:
						repeat(6, minmax(0, 1fr));

					gap: 10px;

					margin-bottom: 20px;
				}

				.stat-card {
					padding: 12px;

					border: 1px solid
						var(--vscode-panel-border);

					border-radius: 6px;

					background:
						var(--vscode-sideBar-background);

					cursor: pointer;

					transition:
						border-color 0.15s ease,
						background 0.15s ease;
				}

				.stat-card:hover {
					border-color:
						var(--vscode-focusBorder);

					background:
						var(--vscode-list-hoverBackground);
				}


				.stat-card.active {
					border-color:
						var(--vscode-focusBorder);

					background:
						var(--vscode-list-activeSelectionBackground);

					color:
						var(--vscode-list-activeSelectionForeground);
				}

				.stat-label {
					font-size: 11px;

					color:
						var(--vscode-descriptionForeground);

					margin-bottom: 6px;
				}

				.stat-value {
					font-size: 20px;

					font-weight: 600;
				}
				
				@media (max-width: 900px) {
					.stats {
						grid-template-columns:
							repeat(3, minmax(0, 1fr));
					}

				}

				@media (max-width: 600px) {
					.stats {
						grid-template-columns:
							repeat(2, minmax(0, 1fr));
					}

				}
				</style>
			</head>
	  	
			<body>

				<div class="header">
					<div class="title">
						All Tasks
					</div>
					 <div class="view-toggle">

						<button
							id="table-view-button"
							class="view-button ${currentView === "table" ? "active" : ""}"
						>
							☷ Table
						</button>

						<button
							id="kanban-view-button"
						class="view-button ${currentView === "kanban" ? "active" : ""}"
						>
							▦ Kanban
						</button>

					</div>

					<div class="count">
						<span id="header-task-count">
							${tasks.length} tasks
						</span>

						<span class="separator">·</span>

						<span id="header-open-count">
							${statusCounts.open} open
						</span>

						<span class="separator">·</span>

						<span id="header-in-progress-count">
							${statusCounts["in-progress"]} in progress
						</span>

						<span class="separator">·</span>

						<span id="header-blocked-count">
							${statusCounts.blocked} blocked
						</span>

						<span class="separator">·</span>

						<span id="header-review-count">
							${statusCounts.review} review
						</span>

						<span class="separator">·</span>

						<span id="header-done-count">
							${statusCounts.done} done
						</span>
					</div>
					<div class="priority-summary">

						<span id="header-critical-count">
							${priorityCounts.critical} critical
						</span>

						<span id="header-high-count">
							${priorityCounts.high} high
						</span>

					</div>


					<button
							id="refresh-tasks"
							class="refresh-button"
							title="Refresh tasks"
						>
							↻ Refresh
						</button>
				</div>
				<div class="stats">
					<div
						class="stat-card"
						data-status-filter="all"
					>
						<div class="stat-label">
							Total
						</div>

						<div
							class="stat-value"
							data-stat="total"
						>
							${stats.total}
						</div>
					</div>


					<div
						class="stat-card"
						data-status-filter="open"
					>
						<div class="stat-label">
							Open
						</div>

						<div
							class="stat-value"
							data-stat="open"
						>
							${stats.open}
						</div>
					</div>


					<div
						class="stat-card"
						data-status-filter="in-progress"
					>
						<div class="stat-label">
							In Progress
						</div>

						<div
							class="stat-value"
							data-stat="in-progress"
						>
							${stats.inProgress}
						</div>
					</div>


					<div
						class="stat-card"
						data-status-filter="blocked"
					>
						<div class="stat-label">
							Blocked
						</div>

						<div
							class="stat-value"
							data-stat="blocked"
						>
							${stats.blocked}
						</div>
					</div>


					<div
						class="stat-card"
						data-status-filter="review"
					>
						<div class="stat-label">
							Review
						</div>

						<div
							class="stat-value"
							data-stat="review"
						>
							${stats.review}
						</div>
					</div>


					<div
						class="stat-card"
						data-status-filter="done"
					>
						<div class="stat-label">
							Done
						</div>

						<div
							class="stat-value"
							data-stat="done"
						>
							${stats.done}
						</div>
					</div>

				</div>

				<div class="toolbar">

					<input
						id="task-search"
						type="search"
						placeholder="Search tasks..."
					/>
			
					<select id="status-filter">
						<option value="all" selected>
							Show All
						</option>

						<option value="open">
							Open
						</option>

						<option value="in-progress">
							In Progress
						</option>

						<option value="blocked">
							Blocked
						</option>

						<option value="review">
							Review
						</option>

						<option value="done">
							Done
						</option>
					</select>

					<select id="type-filter">
						<option value="all">All types</option>
						<option value="TODO">TODO</option>
						<option value="FIXME">FIXME</option>
						<option value="BUG">BUG</option>
						<option value="HACK">HACK</option>
						<option value="REFACTOR">REFACTOR</option>
					</select>
					<select id="priority-filter">

						<option value="all">
							All priorities
						</option>

						<option value="low">
							Low
						</option>

						<option value="medium">
							Medium
						</option>

						<option value="high">
							High
						</option>

						<option value="critical">
							Critical
						</option>

					</select>
					<select id="sort-filter">

						<option value="updated-desc">
							Recently updated
						</option>

						<option value="updated-asc">
							Least recently updated
						</option>

						<option value="created-desc">
							Recently created
						</option>

						<option value="created-asc">
							Oldest created
						</option>

						<option value="priority-desc">
							Highest priority
						</option>

						<option value="priority-asc">
							Lowest priority
						</option>

						<option value="title-asc">
							Task name A–Z
						</option>

						<option value="title-desc">
							Task name Z–A
						</option>

					</select>

				</div>
				<div id="table-view"
					style="display: ${currentView === "table" ? "block" : "none"};"
					>
					<table>
						<thead>						
							<tr>
								<th>Task</th>
								<th>Type</th>
								<th>Status</th>
								<th>Priority</th>
								<th>Location</th>
							</tr>
						</thead>
						<tbody>
							${rows}
						</tbody>

					</table>
				</div>
				<div
					id="kanban-view"
					class="kanban-view"
					style="display: ${currentView === "kanban" ? "block" : "none"};"
				>
					<div class="kanban-board">
						<div
							class="kanban-column"
							data-status="open"
						>
							<div class="kanban-column-header">
								<span>Open</span>
								<span class="kanban-count">0</span>
							</div>
							<div class="kanban-cards"></div>
						</div>
						<div
							class="kanban-column"
							data-status="in-progress"
						>
							<div class="kanban-column-header">
								<span>In Progress</span>
								<span class="kanban-count">0</span>
							</div>

							<div class="kanban-cards"></div>
						</div>
						<div
							class="kanban-column"
							data-status="blocked"
						>
							<div class="kanban-column-header">
								<span>Blocked</span>
								<span class="kanban-count">0</span>
							</div>

							<div class="kanban-cards"></div>
						</div>
						<div
							class="kanban-column"
							data-status="review"
						>
							<div class="kanban-column-header">
								<span>Review</span>
								<span class="kanban-count">0</span>
							</div>

							<div class="kanban-cards"></div>
						</div>
						<div
							class="kanban-column"
							data-status="done"
						>
							<div class="kanban-column-header">
								<span>Done</span>
								<span class="kanban-count">0</span>
							</div>

							<div class="kanban-cards"></div>
						</div>
					</div>
				</div>	
			<script>
				const vscode = acquireVsCodeApi();


				/*
				* ============================================================
				* KANBAN
				* ============================================================
				*/

				function escapeHtml(value) {
					return value
						.replace(/&/g, "&amp;")
						.replace(/</g, "&lt;")
						.replace(/>/g, "&gt;")
						.replace(/"/g, "&quot;")
						.replace(/'/g, "&#039;");
				}

				function getFileName(filePath) {
					return filePath.split(/[\\/]/).pop() || "";
				}

				function buildTaskRowHtml(task) {
					const fileName =
						getFileName(task.filePath);

					return (
						'<tr class="task-row" ' +
						'data-task-id="' +
						escapeHtml(task.id) +
						'" data-title="' +
						escapeHtml(task.title.toLowerCase()) +
						'" data-status="' +
						task.status +
						'" data-type="' +
						task.type +
						'" data-priority="' +
						task.priority +
						'" data-created-at="' +
						escapeHtml(task.createdAt) +
						'" data-updated-at="' +
						escapeHtml(task.updatedAt) +
						'" data-file-name="' +
						escapeHtml(fileName) +
						'" data-line="' +
						(task.line + 1) +
						'">' +
						"<td>" +
						escapeHtml(task.title) +
						"</td>" +
						"<td>" +
						escapeHtml(task.type) +
						"</td>" +
						"<td>" +
						'<select class="status-select" data-task-id="' +
						escapeHtml(task.id) +
						'" data-current-status="' +
						task.status +
						'">' +
						'<option value="open" ' +
						(task.status === "open" ? "selected" : "") +
						">Open</option>" +
						'<option value="in-progress" ' +
						(task.status === "in-progress"
							? "selected"
							: "") +
						">In Progress</option>" +
						'<option value="blocked" ' +
						(task.status === "blocked" ? "selected" : "") +
						">Blocked</option>" +
						'<option value="review" ' +
						(task.status === "review" ? "selected" : "") +
						">Review</option>" +
						'<option value="done" ' +
						(task.status === "done" ? "selected" : "") +
						">Done</option>" +
						"</select>" +
						"</td>" +
						"<td>" +
						'<select class="priority-select" data-task-id="' +
						escapeHtml(task.id) +
						'" data-current-priority="' +
						task.priority +
						'">' +
						'<option value="low" ' +
						(task.priority === "low" ? "selected" : "") +
						">Low</option>" +
						'<option value="medium" ' +
						(task.priority === "medium"
							? "selected"
							: "") +
						">Medium</option>" +
						'<option value="high" ' +
						(task.priority === "high" ? "selected" : "") +
						">High</option>" +
						'<option value="critical" ' +
						(task.priority === "critical"
							? "selected"
							: "") +
						">Critical</option>" +
						"</select>" +
						"</td>" +
						"<td>" +
						escapeHtml(task.filePath) +
						":" +
						(task.line + 1) +
						"</td>" +
						"</tr>"
					);
				}

				function updateHeaderSummary(tasks) {
					const totalCount =
						document.getElementById(
							"header-task-count"
						);

					const openCount =
						document.getElementById(
							"header-open-count"
						);

					const inProgressCount =
						document.getElementById(
							"header-in-progress-count"
						);

					const blockedCount =
						document.getElementById(
							"header-blocked-count"
						);

					const reviewCount =
						document.getElementById(
							"header-review-count"
						);

					const doneCount =
						document.getElementById(
							"header-done-count"
						);

					const criticalCount =
						document.getElementById(
							"header-critical-count"
						);

					const highCount =
						document.getElementById(
							"header-high-count"
						);

					const statusCounts = {
						open: 0,
						"in-progress": 0,
						blocked: 0,
						review: 0,
						done: 0,
					};

					const priorityCounts = {
						critical: 0,
						high: 0,
					};

					tasks.forEach((task) => {
						if (task.status in statusCounts) {
							statusCounts[task.status] += 1;
						}

						if (task.priority in priorityCounts) {
							priorityCounts[task.priority] += 1;
						}
					});

					if (totalCount) {
						totalCount.textContent =
							String(tasks.length) + " tasks";
					}

					if (openCount) {
						openCount.textContent =
							String(statusCounts.open) + " open";
					}

					if (inProgressCount) {
						inProgressCount.textContent =
							String(statusCounts["in-progress"]) +
							" in progress";
					}

					if (blockedCount) {
						blockedCount.textContent =
							String(statusCounts.blocked) + " blocked";
					}

					if (reviewCount) {
						reviewCount.textContent =
							String(statusCounts.review) + " review";
					}

					if (doneCount) {
						doneCount.textContent =
							String(statusCounts.done) + " done";
					}

					if (criticalCount) {
						criticalCount.textContent =
							String(priorityCounts.critical) +
							" critical";
					}

					if (highCount) {
						highCount.textContent =
							String(priorityCounts.high) + " high";
					}
				}

				function renderTaskRows(tasks) {
					if (!tableBody) {
						return;
					}

					tableBody.innerHTML = tasks
						.map((task) => buildTaskRowHtml(task))
						.join("");

					bindTaskInteractions();
				}

				function bindTaskRowEvents() {
					document
						.querySelectorAll(".task-row")
						.forEach((row) => {
							row.addEventListener("click", () => {
								const taskId =
									row.dataset.taskId;

								if (!taskId) {
									return;
								}

								console.log(
									"Clicked task:",
									taskId
								);

								vscode.postMessage({
									command: "openTask",
									taskId,
								});
							});
						});
				}

				function bindStatusSelectEvents() {
					document
						.querySelectorAll(".status-select")
						.forEach((select) => {
							select.addEventListener(
								"click",
								(event) => {
									event.stopPropagation();
								}
							);

							select.addEventListener(
								"change",
								() => {
									const taskId =
										select.dataset.taskId;
									const newStatus =
										select.value;
									const previousStatus =
										select.dataset.currentStatus;

									select.dataset.previousStatus =
										previousStatus;
									select.classList.add(
										"updating"
									);
									select.disabled = true;

									vscode.postMessage({
										command: "updateStatus",
										taskId,
										status: newStatus,
									});
								}
							);
						});
				}

				function bindPrioritySelectEvents() {
					document
						.querySelectorAll(".priority-select")
						.forEach((select) => {
							select.addEventListener(
								"click",
								(event) => {
									event.stopPropagation();
								}
							);

							select.addEventListener(
								"change",
								() => {
									const taskId =
										select.dataset.taskId;
									const newPriority =
										select.value;
									const previousPriority =
										select.dataset.currentPriority;

									select.dataset.previousPriority =
										previousPriority;
									select.classList.add(
										"updating"
									);
									select.disabled = true;

									vscode.postMessage({
										command: "updatePriority",
										taskId,
										priority: newPriority,
									});
								}
							);
						});
				}

				function bindTaskInteractions() {
					bindTaskRowEvents();
					bindStatusSelectEvents();
					bindPrioritySelectEvents();
				}

				

				function renderKanban() {

					const columns =
						document.querySelectorAll(
							".kanban-column"
						);

					columns.forEach((column) => {

						const status =
							column.dataset.status;

						const cardsContainer =
							column.querySelector(
								".kanban-cards"
							);

						const count =
							column.querySelector(
								".kanban-count"
							);

						if (!cardsContainer || !count) {
							return;
						}

						cardsContainer.innerHTML = "";

						const rows =
							Array.from(
								document.querySelectorAll(
									".task-row"
								)
							);

						const matchingRows =
							rows.filter((row) => {

								return (
									row.dataset.status ===
									status &&
									row.style.display !== "none"
								);

							});

						count.textContent =
							String(
								matchingRows.length
							);


						if (matchingRows.length === 0) {

							cardsContainer.innerHTML =
								'<div class="kanban-empty">' +
									'No tasks' +
								'</div>';

							return;
						}


						matchingRows.forEach((row) => {

							const taskId =
								row.dataset.taskId || "";

							const title =
								row.dataset.title || "";

							const type =
								row.dataset.type || "";

							const priority =
								row.dataset.priority || "";


							const card =
								document.createElement(
									"div"
								);

							card.className =
								"kanban-card";

							card.draggable = true;

							card.dataset.taskId =
								taskId;


							/*
							* Prevent a drag operation from
							* accidentally triggering the
							* card click afterwards.
							*/
							let wasDragging = false;


							/*
							* DRAG START
							*/
							card.addEventListener(
								"dragstart",
								(event) => {

									wasDragging = true;

									event.dataTransfer.setData(
										"text/plain",
										taskId
									);

									card.classList.add(
										"dragging"
									);
								}
							);


							/*
							* DRAG END
							*/
							card.addEventListener(
								"dragend",
								() => {

									card.classList.remove(
										"dragging"
									);

									setTimeout(() => {

										wasDragging =
											false;

									}, 0);
								}
							);


							/*
							* CARD CONTENT
							*/
							const fileName =
								row.dataset.fileName || "";

							const line =
								row.dataset.line || "";


							card.innerHTML =
								'<div class="kanban-card-title">' +
									escapeHtml(title) +
								'</div>' +

								'<div class="kanban-card-meta">' +

									'<span class="task-type-badge type-' +
										type.toLowerCase() +
									'">' +
										type +
									'</span>' +

									'<span class="priority-badge priority-' +
										priority.toLowerCase() +
									'">' +
										priority +
									'</span>' +

								'</div>' +

								'<div class="kanban-card-location">' +

									'<span class="codicon codicon-file-code"></span>' +

									'<span>' +
										fileName +
									'</span>' +

									'<span class="kanban-card-line">' +
										'Line ' +
										line +
									'</span>' +

								'</div>';


							/*
							* CLICK CARD
							*
							* Only open the source file
							* if the card wasn't dragged.
							*/
							card.addEventListener(
								"click",
								() => {

									if (wasDragging) {
										return;
									}

									vscode.postMessage({
										command: "openTaskDetails",
										taskId: taskId,
									});
								}
							);


							cardsContainer.appendChild(
								card
							);
						});
					});
				}


				/*
				* ============================================================
				* KANBAN DRAG & DROP
				* ============================================================
				*/

				const kanbanColumns =
					document.querySelectorAll(
						".kanban-column"
					);


				kanbanColumns.forEach((column) => {

					/*
					* Allow cards to be dragged over
					* the column.
					*/
					column.addEventListener(
						"dragover",
						(event) => {

							event.preventDefault();

							column.classList.add(
								"drag-over"
							);
						}
					);


					/*
					* Remove visual drag state.
					*/
					column.addEventListener(
						"dragleave",
						() => {

							column.classList.remove(
								"drag-over"
							);
						}
					);


					/*
					* Handle dropped cards.
					*/
					column.addEventListener(
						"drop",
						(event) => {

							event.preventDefault();

							column.classList.remove(
								"drag-over"
							);


							const taskId =
								event.dataTransfer.getData(
									"text/plain"
								);


							const newStatus =
								column.dataset.status;


							if (
								!taskId ||
								!newStatus
							) {
								return;
							}


							vscode.postMessage({
								command:
									"updateStatus",

								taskId:
									taskId,

								status:
									newStatus,
							});
						}
					);
				});


				/*
				* ============================================================
				* VIEW ELEMENTS
				* ============================================================
				*/

				const tableView =
					document.getElementById(
						"table-view"
					);


				const kanbanView =
					document.getElementById(
						"kanban-view"
					);


				const tableViewButton =
					document.getElementById(
						"table-view-button"
					);


				const kanbanViewButton =
					document.getElementById(
						"kanban-view-button"
					);


				/*
				* ============================================================
				* VIEW SWITCHING
				* ============================================================
				*/

				tableViewButton.addEventListener(
					"click",
					() => {

						tableView.style.display =
							"";

						kanbanView.style.display =
							"none";


						tableViewButton.classList.add(
							"active"
						);

						kanbanViewButton.classList.remove(
							"active"
						);


						vscode.postMessage({
							command:
								"setView",

							view:
								"table",
						});
					}
				);


				kanbanViewButton.addEventListener(
					"click",
					() => {

						tableView.style.display =
							"none";

						kanbanView.style.display =
							"";


						tableViewButton.classList.remove(
							"active"
						);

						kanbanViewButton.classList.add(
							"active"
						);


						renderKanban();


						vscode.postMessage({
							command:
								"setView",

							view:
								"kanban",
						});
					}
				);


				/*
				* ============================================================
				* FILTERS / SEARCH / SORT
				* ============================================================
				*/

				const searchInput =
					document.getElementById(
						"task-search"
					);


				const statusFilter =
					document.getElementById(
						"status-filter"
					);


				const typeFilter =
					document.getElementById(
						"type-filter"
					);


				const priorityFilter =
					document.getElementById(
						"priority-filter"
					);


				const sortFilter =
					document.getElementById(
						"sort-filter"
					);


				const statCards =
					document.querySelectorAll(
						'.stat-card[data-status-filter]'
					);


				statCards.forEach((card) => {

					card.addEventListener(
						'click',
						() => {

							const status =
								card.dataset.statusFilter;

							if (!status) {
								return;
							}


							statusFilter.value =
								status;


							statCards.forEach((item) => {
								item.classList.remove(
									'active'
								);
							});


							card.classList.add(
								'active'
							);


							filterTasks();
						}
					);

				});

				/*
				* ============================================================
				* REFRESH
				* ============================================================
				*/

				const refreshButton =
					document.getElementById(
						"refresh-tasks"
					);


				/*
				* The table body is needed for sorting.
				*/
				const tableBody =
					document.querySelector(
						"tbody"
					);


				refreshButton.addEventListener(
					"click",
					() => {

						refreshButton.disabled =
							true;

						refreshButton.textContent =
							"Refreshing...";


						vscode.postMessage({
							command:
								"refreshTasks",
						});
					}
				);

				bindTaskInteractions();
				filterTasks();


				/*
				* ============================================================
				* FILTER TASKS
				* ============================================================
				*/

				function filterTasks() {

					const search =
						searchInput.value
							.trim()
							.toLowerCase();


					const selectedStatus =
						statusFilter.value;


					const selectedType =
						typeFilter.value;


					const selectedPriority =
						priorityFilter.value;


					const selectedSort =
						sortFilter.value;


					const rowsArray =
						Array.from(
							document.querySelectorAll(
								".task-row"
							)
						);


					rowsArray.forEach((row) => {

						const title =
							row.dataset.title || "";


						const status =
							row.dataset.status || "";


						const type =
							row.dataset.type || "";


						const priority =
							row.dataset.priority || "";


						const matchesSearch =
							!search ||
							title.includes(
								search
							);


						const matchesStatus =
							selectedStatus === "all" ||
							status ===
								selectedStatus;


						const matchesType =
							selectedType === "all" ||
							type ===
								selectedType;


						const matchesPriority =
							selectedPriority === "all" ||
							priority ===
								selectedPriority;


						const visible =
							matchesSearch &&
							matchesStatus &&
							matchesType &&
							matchesPriority;


						row.style.display =
							visible
								? ""
								: "none";
					});


					sortRows(
						rowsArray,
						selectedSort
					);

					statCards.forEach((card) => {

						const cardStatus =
							card.dataset.statusFilter;

						card.classList.toggle(
							'active',
							cardStatus === selectedStatus
						);

					});


					/*
					* Keep Kanban synchronized
					* with filters.
					*/
					if (
						kanbanView.style.display !==
						"none"
					) {
						renderKanban();
					}
				}


				/*
				* ============================================================
				* SORTING
				* ============================================================
				*/

				function sortRows(
					rows,
					sortType
				) {

					if (!tableBody) {
						return;
					}


					const priorityOrder = {
						low: 1,
						medium: 2,
						high: 3,
						critical: 4,
					};


					rows.sort((a, b) => {

						switch (sortType) {

							case "updated-desc":

								return compareDates(
									b.dataset.updatedAt,
									a.dataset.updatedAt
								);


							case "updated-asc":

								return compareDates(
									a.dataset.updatedAt,
									b.dataset.updatedAt
								);


							case "created-desc":

								return compareDates(
									b.dataset.createdAt,
									a.dataset.createdAt
								);


							case "created-asc":

								return compareDates(
									a.dataset.createdAt,
									b.dataset.createdAt
								);


							case "priority-desc":

								return (
									priorityOrder[
										b.dataset.priority
									] -
									priorityOrder[
										a.dataset.priority
									]
								);


							case "priority-asc":

								return (
									priorityOrder[
										a.dataset.priority
									] -
									priorityOrder[
										b.dataset.priority
									]
								);


							case "title-asc":

								return (
									a.dataset.title || ""
								).localeCompare(
									b.dataset.title || ""
								);


							case "title-desc":

								return (
									b.dataset.title || ""
								).localeCompare(
									a.dataset.title || ""
								);


							default:

								return 0;
						}
					});


					rows.forEach((row) => {

						tableBody.appendChild(
							row
						);
					});
				}


				function compareDates(
					a,
					b
				) {

					return (
						new Date(a).getTime() -
						new Date(b).getTime()
					);
				}


				/*
				* ============================================================
				* FILTER EVENT LISTENERS
				* ============================================================
				*/

				searchInput.addEventListener(
					"input",
					filterTasks
				);


				statusFilter.addEventListener(
					"change",
					filterTasks
				);


				typeFilter.addEventListener(
					"change",
					filterTasks
				);


				priorityFilter.addEventListener(
					"change",
					filterTasks
				);


				sortFilter.addEventListener(
					"change",
					filterTasks
				);


				/*
				* ============================================================
				* MESSAGES FROM EXTENSION HOST
				* ============================================================
				*/

				window.addEventListener(
					"message",
					(event) => {

						const message =
							event.data;


						/*
						* ----------------------------------------------------
						* TASKS UPDATED
						* ----------------------------------------------------
						*/

						if (
							message.command ===
							"tasksUpdated"
						) {

							renderTaskRows(
								message.tasks || []
							);

							updateHeaderSummary(
								message.tasks || []
							);

							filterTasks();

							return;
						}


						/*
						* ----------------------------------------------------
						* TASKS REFRESHED
						* ----------------------------------------------------
						*/

						if (
							message.command ===
							"tasksRefreshed"
						) {

							refreshButton.disabled =
								false;

							refreshButton.textContent =
								"↻ Refresh";

							return;
						}


						/*
						* ----------------------------------------------------
						* STATUS UPDATED
						* ----------------------------------------------------
						*/

						if (
							message.command ===
							"statusUpdated"
						) {

							const select =
								document.querySelector(
									'.status-select[data-task-id="' +
									message.taskId +
									'"]'
								);


							if (!select) {
								return;
							}


							select.value =
								message.status;


							select.dataset.currentStatus =
								message.status;


							const row =
								select.closest(
									".task-row"
								);


							if (row) {

								row.dataset.status =
									message.status;
							}


							select.classList.remove(
								"updating"
							);


							select.disabled =
								false;


							/*
							* Re-run filters so a task
							* immediately moves in/out
							* of the selected status.
							*/
							filterTasks();


							/*
							* Keep Kanban synchronized.
							*/
							if (
								kanbanView.style.display !==
								"none"
							) {
								renderKanban();
							}


							return;
						}


						 /*
						* ----------------------------------------------------
						* STATS UPDATED
						* ----------------------------------------------------
						*/

						if (
							message.command ===
							"statsUpdated"
						) {

							const stats =
								message.stats;

							const total =
								document.querySelector(
									'[data-stat="total"]'
								);

							const open =
								document.querySelector(
									'[data-stat="open"]'
								);

							const inProgress =
								document.querySelector(
									'[data-stat="in-progress"]'
								);

							const blocked =
								document.querySelector(
									'[data-stat="blocked"]'
								);

							const review =
								document.querySelector(
									'[data-stat="review"]'
								);

							const done =
								document.querySelector(
									'[data-stat="done"]'
								);


							if (total) {
								total.textContent =
									String(stats.total);
							}

							if (open) {
								open.textContent =
									String(stats.open);
							}

							if (inProgress) {
								inProgress.textContent =
									String(stats.inProgress);
							}

							if (blocked) {
								blocked.textContent =
									String(stats.blocked);
							}

							if (review) {
								review.textContent =
									String(stats.review);
							}

							if (done) {
								done.textContent =
									String(stats.done);
							}

							return;
						}


						/*
						* ----------------------------------------------------
						* STATUS UPDATE FAILED
						* ----------------------------------------------------
						*/

						if (
							message.command ===
							"statusUpdateFailed"
						) {

							const select =
								document.querySelector(
									'.status-select[data-task-id="' +
									message.taskId +
									'"]'
								);


							if (!select) {
								return;
							}


							select.value =
								select.dataset.previousStatus;


							select.classList.remove(
								"updating"
							);


							select.disabled =
								false;


							return;
						}


						/*
						* ----------------------------------------------------
						* PRIORITY UPDATED
						* ----------------------------------------------------
						*/

						if (
							message.command ===
							"priorityUpdated"
						) {

							const select =
								document.querySelector(
									'.priority-select[data-task-id="' +
									message.taskId +
									'"]'
								);


							if (!select) {
								return;
							}


							select.value =
								message.priority;


							select.dataset.currentPriority =
								message.priority;


							const row =
								select.closest(
									".task-row"
								);


							if (row) {

								row.dataset.priority =
									message.priority;
							}


							select.classList.remove(
								"updating"
							);


							select.disabled =
								false;


							filterTasks();


							/*
							* Keep Kanban synchronized.
							*/
							if (
								kanbanView.style.display !==
								"none"
							) {
								renderKanban();
							}


							return;
						}


						/*
						* ----------------------------------------------------
						* PRIORITY UPDATE FAILED
						* ----------------------------------------------------
						*/

						if (
							message.command ===
							"priorityUpdateFailed"
						) {

							const select =
								document.querySelector(
									'.priority-select[data-task-id="' +
									message.taskId +
									'"]'
								);


							if (!select) {
								return;
							}


							select.value =
								select.dataset.previousPriority;


							select.classList.remove(
								"updating"
							);


							select.disabled =
								false;


							return;
						}
					}
				);

				window.addEventListener(
					"visibilitychange",
					() => {

						if (
							document.visibilityState ===
							"visible"
						) {

							vscode.postMessage({
								command:
									"requestTasksSync",
							});

						}
					}
				);

				window.addEventListener(
					"focus",
					() => {
						vscode.postMessage({
							command:
								"requestTasksSync",
						});
					}
				);


				/*
				* ============================================================
				* INITIAL KANBAN RENDER
				* ============================================================
				*
				* If the workspace was reopened while
				* Kanban was the active view, render it
				* immediately.
				*/

				if (
					kanbanView &&
					kanbanView.style.display !==
						"none"
				) {

					renderKanban();
				}

			</script>		
		</body>
	</html>
		`;
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

// possiblity to add a task directly on the view
