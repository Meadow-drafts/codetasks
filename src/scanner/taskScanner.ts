import * as vscode from 'vscode';
import { CodeTask } from '../models/task';

const TASK_PATTERN =
	/\b(TODO|FIXME|BUG|HACK|REFACTOR|TASK)\s*:\s*(.+)/i;

export async function scanWorkspace(): Promise<CodeTask[]> {
	const tasks: CodeTask[] = [];

	const files = await vscode.workspace.findFiles(
		'**/*',
		'**/{node_modules,.git,dist,build,out}/**'
	);

	for (const file of files) {
		try {
			const document = await vscode.workspace.openTextDocument(file);
			const lines = document.getText().split(/\r?\n/);

			lines.forEach((line, index) => {
				const match = line.match(TASK_PATTERN);

				if (!match) {
					return;
				}

				const [, type, title] = match;

				tasks.push({
					id: `${file.fsPath}:${index + 1}`,
					type: type.toUpperCase(),
					title: title.trim(),
					filePath: file.fsPath,
					line: index,
					status: 'open',
					priority: 'medium',
					createdAt: new Date().toISOString(),
				});
			});
		} catch (error) {
			console.error(`Failed to scan ${file.fsPath}`, error);
		}
	}

	return tasks;
}