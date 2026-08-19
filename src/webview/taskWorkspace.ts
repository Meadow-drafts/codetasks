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

    const storeChangeSubscription = this.taskStore.onDidChange(() => {
      panel.webview.html = this.getHtml(currentView);
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
        if (message.command === "openTask") {
          const task = this.taskStore
            .getTasks()
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
            .getTasks()
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
            .getTasks()
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

  private getHtml(
    currentView: "table" | "kanban" = "table",
): string {
    const tasks = this.taskStore.getTasks();
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
						vscode.Uri.file(task.filePath).fsPath.split("/").pop() || ""
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
							class="view-button ${
							currentView === "table"
								? "active"
								: ""
						}"
						>
							☷ Table
						</button>

						<button
							id="kanban-view-button"
						class="view-button ${
								currentView === "kanban"
									? "active"
									: ""
							}"
						>
							▦ Kanban
						</button>

					</div>

					<div class="count">
						<span>
							${tasks.length} tasks
						</span>

						<span class="separator">·</span>

						<span>
							${statusCounts.open} open
						</span>

						<span class="separator">·</span>

						<span>
							${statusCounts["in-progress"]} in progress
						</span>

						<span class="separator">·</span>

						<span>
							${statusCounts.blocked} blocked
						</span>

						<span class="separator">·</span>

						<span>
							${statusCounts.review} review
						</span>

						<span class="separator">·</span>

						<span>
							${statusCounts.done} done
						</span>
					</div>
					<div class="priority-summary">

						<span>
							${priorityCounts.critical} critical
						</span>

						<span>
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
					style="display: ${
						currentView === "table"
							? "block"
							: "none"
					};"
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
					style="display: ${
						currentView === "kanban"
							? "block"
							: "none"
					};"
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
										command: "openTask",
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


				const rows =
					document.querySelectorAll(
						".task-row"
					);


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
				* TABLE ROW CLICK
				* ============================================================
				*/

				rows.forEach((row) => {

					row.addEventListener(
						"click",
						() => {

							const taskId =
								row.dataset.taskId;


							console.log(
								"Clicked task:",
								taskId
							);


							vscode.postMessage({
								command:
									"openTask",

								taskId:
									taskId,
							});
						}
					);
				});


				/*
				* ============================================================
				* STATUS DROPDOWNS
				* ============================================================
				*/

				const statusSelects =
					document.querySelectorAll(
						".status-select"
					);


				statusSelects.forEach((select) => {

					/*
					* Prevent dropdown click from
					* opening the task.
					*/
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


							/*
							* Loading state.
							*/
							select.classList.add(
								"updating"
							);

							select.disabled =
								true;


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
				* PRIORITY DROPDOWNS
				* ============================================================
				*/

				const prioritySelects =
					document.querySelectorAll(
						".priority-select"
					);


				prioritySelects.forEach((select) => {

					/*
					* Prevent dropdown click from
					* opening the task.
					*/
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


							/*
							* Loading state.
							*/
							select.classList.add(
								"updating"
							);

							select.disabled =
								true;


							vscode.postMessage({
								command:
									"updatePriority",

								taskId:
									taskId,

								priority:
									newPriority,
							});
						}
					);
				});


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