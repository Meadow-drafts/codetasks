import * as vscode from "vscode";
import { TaskStore } from "../store/taskStore";
import { CodeTask } from "../models/task";

export class TaskWorkspaceProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly taskStore: TaskStore,
  ) {}

  private formatStatus(
	status: CodeTask["status"]
): string {
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

  open(): void {
    const panel = vscode.window.createWebviewPanel(
      "codetasks.workspace",
      "CodeTasks",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
      },
    );

    panel.webview.onDidReceiveMessage(
      async (message) => {
        console.log("CodeTasks Webview message:", message);

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
	const updated =
		this.taskStore.updateTaskStatus(
			message.taskId,
			message.status
		);

	if (!updated) {
	vscode.window.showErrorMessage(
		"CodeTasks: Could not update task status."
	);

	panel.webview.postMessage({
		command: "statusUpdateFailed",
		taskId: message.taskId,
	});

	return;
}

	const task = this.taskStore
		.getTasks()
		.find(
			(task) =>
				task.id === message.taskId
		);

	if (!task) {
		return;
	}

	vscode.window.showInformationMessage(
		`Task "${task.title}" marked as ${this.formatStatus(task.status)}.`
	);

	panel.webview.postMessage({
		command: "statusUpdated",
		taskId: task.id,
		status: task.status,
	});

	return;
}
      },
      undefined,
      [],
    );

    panel.webview.html = this.getHtml();
  }

  private getHtml(): string {
    const tasks = this.taskStore.getTasks();

    const rows = tasks
      .map(
        (task) => `
			<tr
				class="task-row"
				data-task-id="${this.escapeHtml(task.id)}"
				data-title="${this.escapeHtml(task.title.toLowerCase())}"
				data-type="${task.type}"
				data-status="${task.status}"
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
				</style>
			</head>
	  	
			<body>

				<div class="header">
					<div class="title">
						All Tasks
					</div>

					<div class="count">
						${tasks.length} tasks
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

				</div>

				<table>

					<thead>
						<tr>
							<th>Task</th>
							<th>Type</th>
							<th>Status</th>
							<th>Location</th>
						</tr>
					</thead>

					<tbody>
						${rows}
					</tbody>

				</table>
				<script>
    const vscode = acquireVsCodeApi();

    const searchInput =
        document.getElementById('task-search');

    const statusFilter =
        document.getElementById('status-filter');

    const typeFilter =
        document.getElementById('type-filter');

    const rows =
        document.querySelectorAll('.task-row');


    function filterTasks() {

        const search =
            searchInput.value
                .trim()
                .toLowerCase();

        const selectedStatus =
            statusFilter.value;

        const selectedType =
            typeFilter.value;


        rows.forEach((row) => {

            const title =
                row.dataset.title || '';

            const status =
                row.dataset.status || '';

            const type =
                row.dataset.type || '';


            const matchesSearch =
                !search ||
                title.includes(search);


            const matchesStatus =
                selectedStatus === 'all' ||
                status === selectedStatus;


            const matchesType =
                selectedType === 'all' ||
                type === selectedType;


            const visible =
                matchesSearch &&
                matchesStatus &&
                matchesType;


            row.style.display =
                visible ? '' : 'none';
        });
    }


    searchInput.addEventListener(
        'input',
        filterTasks
    );


    statusFilter.addEventListener(
        'change',
        filterTasks
    );


    typeFilter.addEventListener(
        'change',
        filterTasks
    );


    // Open task source location when
    // clicking anywhere on the task row.
    rows.forEach((row) => {

        row.addEventListener(
            'click',
            () => {

                const taskId =
                    row.dataset.taskId;

                console.log(
                    'Clicked task:',
                    taskId
                );

                vscode.postMessage({
                    command: 'openTask',
                    taskId: taskId,
                });
            }
        );

    });


    // Handle status dropdown changes.
    const statusSelects =
        document.querySelectorAll('.status-select');

    statusSelects.forEach((select) => {

        // Prevent clicking the dropdown
        // from triggering the row click.
        select.addEventListener(
            'click',
            (event) => {
                event.stopPropagation();
            }
        );


       select.addEventListener(
	'change',
	() => {

		const taskId =
			select.dataset.taskId;

		const newStatus =
			select.value;

		const previousStatus =
			select.dataset.currentStatus;

		select.dataset.previousStatus =
			previousStatus;

		select.classList.add('updating');

		select.disabled = true;

		vscode.postMessage({
			command: 'updateStatus',
			taskId,
			status: newStatus,
		});
	}
);

    });


    // Listen for messages coming back
    // from the VS Code extension host.
    window.addEventListener(
	'message',
	(event) => {

		const message =
			event.data;


		const select =
			document.querySelector(
				'.status-select[data-task-id="' +
				message.taskId +
				'"]'
			);


		if (!select) {
			return;
		}


		// Successful update
		if (
    message.command ===
    'statusUpdated'
) {

    // Update the dropdown
    select.value =
        message.status;

    select.dataset.currentStatus =
        message.status;


    // Update the row's status
    const row =
        select.closest('.task-row');

    if (row) {
        row.dataset.status =
            message.status;
    }


    // Stop loading state
    select.classList.remove(
        'updating'
    );

    select.disabled = false;


    // Re-run filters using the
    // updated task status
    filterTasks();

    return;
}


		// Failed update
		if (
			message.command ===
			'statusUpdateFailed'
		) {

			select.value =
				select.dataset.previousStatus;

			select.classList.remove(
				'updating'
			);

			select.disabled = false;

			return;
		}
	}
);

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
