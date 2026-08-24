import * as vscode from "vscode";
import { CodeTask } from "../models/task";
import { TaskStore } from "../store/taskStore";
import { buildTaskTypeCssVariables } from "../theme/taskTypeColors";

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

    panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.visible) {
        postWorkspaceSnapshot();
      }
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
    const taskTypeCssVars = buildTaskTypeCssVariables();
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
    const tasksJson = JSON.stringify(tasks).replace(/</g, "\\u003c");

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
					:root {
						${taskTypeCssVars}
					}

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
					.pagination-bar {
						display: flex;
						justify-content: space-between;
						align-items: center;
						gap: 12px;
						flex-wrap: wrap;
						margin-top: 14px;
						padding-top: 12px;
						border-top: 1px solid
							var(--vscode-panel-border);
					}
					.pagination-controls {
						display: flex;
						align-items: center;
						gap: 8px;
						flex-wrap: wrap;
					}
					.page-size-control {
						display: inline-flex;
						align-items: center;
						gap: 8px;
						color: var(
							--vscode-descriptionForeground
						);
					}
					.pagination-summary,
					.page-info {
						color: var(
							--vscode-descriptionForeground
						);
						font-size: 12px;
					}
					.empty-row td {
						color: var(
							--vscode-descriptionForeground
						);
						text-align: center;
						padding: 18px 12px;
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

						.task-assignee {
							display: block;
							margin-top: 4px;
							font-size: 12px;
							color:
								var(--vscode-descriptionForeground);
						}

						.table-assignee {
							display: inline-flex;
							align-items: center;
							padding: 2px 8px;
							border-radius: 999px;
							font-size: 12px;
							color: var(--vscode-foreground);
							background: color-mix(
								in srgb,
								var(--vscode-button-secondaryBackground) 35%,
								transparent
							);
						}

						.table-assignee.empty {
							color: var(--vscode-descriptionForeground);
							background: transparent;
							padding-left: 0;
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
						overflow-y: hidden;
					}


					.kanban-board {
						display: grid;
						grid-template-columns:
							repeat(5, minmax(220px, 1fr));

						gap: 12px;

						min-width: 1100px;
						align-items: stretch;
						height: min(
							70vh,
							calc(100vh - 360px)
						);
						min-height: 420px;
					}


					.kanban-column {
						background:
							var(--vscode-sideBar-background);

						border:
							1px solid
							var(--vscode-panel-border);

						border-radius: 6px;

						min-height: 400px;
						display: flex;
						flex-direction: column;
						overflow: hidden;
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
						flex: 1;
						overflow-y: auto;
						min-height: 0;
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

				.kanban-card-assignee {
					display: inline-flex;
					align-items: center;
					padding: 2px 7px;
					border-radius: 999px;
					font-size: 11px;
					font-weight: 600;
					color: var(--vscode-foreground);
					background: color-mix(
						in srgb,
						var(--vscode-button-secondaryBackground) 35%,
						transparent
					);
				}

				.kanban-card-assignee.empty {
					display: none;
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
					color: var(--codetasks-task-type-todo);
					background:
						color-mix(
							in srgb,
							var(--codetasks-task-type-todo) 12%,
							transparent
						);
				}


				.type-fixme {
					color: var(--codetasks-task-type-fixme);
					background:
						color-mix(
							in srgb,
							var(--codetasks-task-type-fixme) 12%,
							transparent
						);
				}


				.type-bug {
					color: var(--codetasks-task-type-bug);
					background:
						color-mix(
							in srgb,
							var(--codetasks-task-type-bug) 12%,
							transparent
						);
				}


				.type-hack {
					color: var(--codetasks-task-type-hack);
					background:
						color-mix(
							in srgb,
							var(--codetasks-task-type-hack) 12%,
							transparent
						);
				}


				.type-refactor {
					color: var(--codetasks-task-type-refactor);
					background:
						color-mix(
							in srgb,
							var(--codetasks-task-type-refactor) 12%,
							transparent
						);
				}


				.type-task {
					color: var(--codetasks-task-type-task);
					background:
						color-mix(
							in srgb,
							var(--codetasks-task-type-task) 12%,
							transparent
						);
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
								<th>Assignee</th>
								<th>Type</th>
								<th>Status</th>
								<th>Priority</th>
								<th>Location</th>
							</tr>
						</thead>
						<tbody></tbody>

					</table>
					<div class="pagination-bar">
						<div
							class="pagination-summary"
							id="pagination-summary"
						>
							Showing 0 tasks
						</div>

						<div class="pagination-controls">
							<label class="page-size-control">
								Rows per page
								<select id="page-size">
									<option value="10">10</option>
									<option value="25" selected>25</option>
									<option value="50">50</option>
									<option value="100">100</option>
								</select>
							</label>

							<button
								type="button"
								id="prev-page"
							>
								← Prev
							</button>

							<span
								class="page-info"
								id="page-info"
							>
								Page 1 of 1
							</span>

							<button
								type="button"
								id="next-page"
							>
								Next →
							</button>
						</div>
					</div>
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
				const initialTasks = ${tasksJson};


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
						'" data-assignee="' +
						escapeHtml(task.assignee || "") +
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
						(task.assignee
							? '<span class="table-assignee">' +
								escapeHtml(task.assignee) +
							"</span>"
							: '<span class="table-assignee empty">-</span>') +
						"</td>" +
						"<td>" +
						'<span class="task-type-badge type-' +
						escapeHtml(task.type.toLowerCase()) +
						'">' +
						escapeHtml(task.type) +
						"</span>" +
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
					allTasks = Array.isArray(tasks)
						? [...tasks]
						: [];

					renderTable();
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

				

				function renderKanban(tasks = currentFilteredTasks) {
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

						const matchingTasks = tasks.filter(
							(task) =>
								task.status === status
						);

						count.textContent =
							String(
								matchingTasks.length
							);

						cardsContainer.innerHTML = "";

						if (matchingTasks.length === 0) {
							cardsContainer.innerHTML =
								'<div class="kanban-empty">' +
									"No tasks" +
								"</div>";

							return;
						}

						matchingTasks.forEach((task) => {
							const card =
								document.createElement(
									"div"
								);

							card.className =
								"kanban-card";

							card.draggable = true;
							card.dataset.taskId =
								task.id;

							let wasDragging = false;

							card.addEventListener(
								"dragstart",
								(event) => {
									wasDragging = true;

									event.dataTransfer.setData(
										"text/plain",
										task.id
									);

									card.classList.add(
										"dragging"
									);
								}
							);

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

							card.innerHTML =
								'<div class="kanban-card-title">' +
									escapeHtml(
										task.title
									) +
								"</div>" +
								'<div class="kanban-card-meta">' +
									'<span class="task-type-badge type-' +
										escapeHtml(
											task.type.toLowerCase()
										) +
									'">' +
										escapeHtml(
											task.type
										) +
									"</span>" +
									'<span class="priority-badge priority-' +
										escapeHtml(
											task.priority.toLowerCase()
										) +
									'">' +
										escapeHtml(
											task.priority
										) +
									"</span>" +
								"</div>" +
								(task.assignee
									? '<div class="kanban-card-assignee">Assignee: ' +
										escapeHtml(
											task.assignee
										) +
									"</div>"
									: "") +
								'<div class="kanban-card-location">' +
									'<span class="codicon codicon-file-code"></span>' +
									"<span>" +
										escapeHtml(
											getFileName(
												task.filePath
											)
										) +
									"</span>" +
									'<span class="kanban-card-line">' +
										"Line " +
										(task.line + 1) +
									"</span>" +
								"</div>";

							card.addEventListener(
								"click",
								() => {
									if (wasDragging) {
										return;
									}

									vscode.postMessage({
										command:
											"openTaskDetails",
										taskId: task.id,
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

				const paginationSummary =
					document.getElementById(
						"pagination-summary"
					);

				const pageInfo =
					document.getElementById(
						"page-info"
					);

				const pageSizeSelect =
					document.getElementById(
						"page-size"
					);

				const prevPageButton =
					document.getElementById(
						"prev-page"
					);

				const nextPageButton =
					document.getElementById(
						"next-page"
					);

				const tablePageSize =
					Number(
						pageSizeSelect?.value ?? 25
					) || 25;

				let activeView =
					tableView.style.display !==
					"none"
						? "table"
						: "kanban";

				let allTasks = [];

				let currentFilteredTasks = [];

				let currentPage = 1;

				let pageSize = tablePageSize;


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

						activeView = "table";

						renderTable();


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

						activeView = "kanban";

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

				if (pageSizeSelect) {
					pageSizeSelect.addEventListener(
						"change",
						() => {
							pageSize =
								Number(
									pageSizeSelect.value
								) || 25;
							currentPage = 1;
							renderTable();
						}
					);
				}

				if (prevPageButton) {
					prevPageButton.addEventListener(
						"click",
						() => {
							if (currentPage <= 1) {
								return;
							}

							currentPage -= 1;
							renderTable();
						}
					);
				}

				if (nextPageButton) {
					nextPageButton.addEventListener(
						"click",
						() => {
							currentPage += 1;
							renderTable();
						}
					);
				}

				renderTaskRows(initialTasks);
				updateHeaderSummary(initialTasks);


				/*
				* ============================================================
				* FILTER TASKS
				* ============================================================
				*/

				function getFilterState() {
					return {
						search:
							searchInput.value
								.trim()
								.toLowerCase(),
						selectedStatus:
							statusFilter.value,
						selectedType:
							typeFilter.value,
						selectedPriority:
							priorityFilter.value,
						selectedSort:
							sortFilter.value,
					};
				}

				function sortTasks(tasks, sortType) {
					const priorityOrder = {
						low: 1,
						medium: 2,
						high: 3,
						critical: 4,
					};

					return [...tasks].sort((a, b) => {
						switch (sortType) {
							case "updated-desc":
								return compareDates(
									b.updatedAt,
									a.updatedAt
								);
							case "updated-asc":
								return compareDates(
									a.updatedAt,
									b.updatedAt
								);
							case "created-desc":
								return compareDates(
									b.createdAt,
									a.createdAt
								);
							case "created-asc":
								return compareDates(
									a.createdAt,
									b.createdAt
								);
							case "priority-desc":
								return (
									priorityOrder[
										b.priority
									] -
									priorityOrder[
										a.priority
									]
								);
							case "priority-asc":
								return (
									priorityOrder[
										a.priority
									] -
									priorityOrder[
										b.priority
									]
								);
							case "title-asc":
								return (
									a.title || ""
								).localeCompare(
									b.title || ""
								);
							case "title-desc":
								return (
									b.title || ""
								).localeCompare(
									a.title || ""
								);
							default:
								return 0;
						}
					});
				}

				function getFilteredTasks(tasks) {
					const {
						search,
						selectedStatus,
						selectedType,
						selectedPriority,
						selectedSort,
					} = getFilterState();

					const filteredTasks = tasks.filter(
						(task) => {
							const title =
								(task.title || "")
									.toLowerCase();

							const matchesSearch =
								!search ||
								title.includes(
									search
								);

							const matchesStatus =
								selectedStatus ===
									"all" ||
								task.status ===
									selectedStatus;

							const matchesType =
								selectedType ===
									"all" ||
								task.type ===
									selectedType;

							const matchesPriority =
								selectedPriority ===
									"all" ||
								task.priority ===
									selectedPriority;

							return (
								matchesSearch &&
								matchesStatus &&
								matchesType &&
								matchesPriority
							);
						}
					);

					return sortTasks(
						filteredTasks,
						selectedSort
					);
				}

				function updatePaginationControls(
					totalItems,
					totalPages
				) {
					if (paginationSummary) {
						const start =
							totalItems === 0
								? 0
								: (currentPage - 1) *
										pageSize +
									1;
						const end =
							totalItems === 0
								? 0
								: Math.min(
										currentPage *
											pageSize,
										totalItems
									);

						paginationSummary.textContent =
							totalItems === 0
								? "No tasks match the current filters."
								: "Showing " +
									start +
									"–" +
									end +
									" of " +
									totalItems +
									" task(s)";
					}

					if (pageInfo) {
						pageInfo.textContent =
							"Page " +
							currentPage +
							" of " +
							totalPages;
					}

					if (prevPageButton) {
						prevPageButton.disabled =
							currentPage <= 1;
					}

					if (nextPageButton) {
						nextPageButton.disabled =
							currentPage >= totalPages;
					}
				}

				function renderTable() {
					if (!tableBody) {
						return;
					}

					const visibleTasks =
						getFilteredTasks(allTasks);

					currentFilteredTasks =
						visibleTasks;

					const totalItems =
						visibleTasks.length;

					const totalPages =
						Math.max(
							1,
							Math.ceil(
								totalItems / pageSize
							)
						);

					currentPage = Math.min(
						Math.max(currentPage, 1),
						totalPages
					);

					const start =
						(currentPage - 1) * pageSize;

					const pageTasks =
						visibleTasks.slice(
							start,
							start + pageSize
						);

					tableBody.innerHTML =
						pageTasks.length === 0
							? '<tr class="empty-row"><td colspan="6">No tasks match the current filters.</td></tr>'
							: pageTasks
									.map((task) =>
										buildTaskRowHtml(
											task
										)
									)
									.join("");

					bindTaskInteractions();
					updatePaginationControls(
						totalItems,
						totalPages
					);

					statCards.forEach((card) => {
						const cardStatus =
							card.dataset.statusFilter;

						card.classList.toggle(
							"active",
							cardStatus ===
								statusFilter.value
						);
					});

					if (activeView === "kanban") {
						renderKanban(
							visibleTasks
						);
					}
				}

				function filterTasks() {
					currentPage = 1;
					renderTable();
				}


				/*
				* ============================================================
				* SORTING
				* ============================================================
				*/

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

							allTasks = allTasks.map(
								(task) =>
									task.id ===
									message.taskId
										? {
												...task,
												status:
													message.status,
											}
										: task
							);

							renderTable();


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

							allTasks = allTasks.map(
								(task) =>
									task.id ===
									message.taskId
										? {
												...task,
												priority:
													message.priority,
											}
										: task
							);

							renderTable();


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
