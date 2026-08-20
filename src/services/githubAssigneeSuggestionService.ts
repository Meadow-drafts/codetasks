import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";

export type GitHubContributorSuggestion = {
  login: string;
};

type GitHubRepository = {
  host: string;
  owner: string;
  repo: string;
  apiBaseUrl: string;
};

function parseRemoteSpec(remoteUrl: string): GitHubRepository | undefined {
  const httpsMatch = remoteUrl.match(
    /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/,
  );

  if (httpsMatch) {
    const [, host, owner, repo] = httpsMatch;

    return {
      host,
      owner,
      repo,
      apiBaseUrl:
        host === "github.com"
          ? "https://api.github.com"
          : `https://${host}/api/v3`,
    };
  }

  const sshMatch = remoteUrl.match(
    /^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/,
  );

  if (sshMatch) {
    const [, host, owner, repo] = sshMatch;

    return {
      host,
      owner,
      repo,
      apiBaseUrl:
        host === "github.com"
          ? "https://api.github.com"
          : `https://${host}/api/v3`,
    };
  }

  const sshUrlMatch = remoteUrl.match(
    /^ssh:\/\/git@([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/,
  );

  if (sshUrlMatch) {
    const [, host, owner, repo] = sshUrlMatch;

    return {
      host,
      owner,
      repo,
      apiBaseUrl:
        host === "github.com"
          ? "https://api.github.com"
          : `https://${host}/api/v3`,
    };
  }

  return undefined;
}

export function parseGitHubRemoteUrl(
  remoteUrl: string,
): GitHubRepository | undefined {
  return parseRemoteSpec(remoteUrl);
}

async function readGitConfig(workspaceFolder: vscode.Uri): Promise<string> {
  const gitFolderUri = vscode.Uri.joinPath(workspaceFolder, ".git");

  try {
    const stats = await vscode.workspace.fs.stat(gitFolderUri);

    if (stats.type === vscode.FileType.Directory) {
      return path.join(gitFolderUri.fsPath, "config");
    }

    const rawGitFolder = await fs.readFile(gitFolderUri.fsPath, "utf8");
    const gitdirMatch = rawGitFolder.match(/gitdir:\s*(.+)/i);

    if (!gitdirMatch) {
      return path.join(gitFolderUri.fsPath, "config");
    }

    const gitDir = gitdirMatch[1].trim();

    return path.isAbsolute(gitDir)
      ? path.join(gitDir, "config")
      : path.resolve(path.dirname(gitFolderUri.fsPath), gitDir, "config");
  } catch {
    return path.join(gitFolderUri.fsPath, "config");
  }
}

function parseRemoteUrls(
  configText: string,
): Array<{ name: string; url: string }> {
  const lines = configText.split(/\r?\n/);
  const remotes = new Map<string, string>();
  let currentRemote: string | undefined;

  for (const line of lines) {
    const sectionMatch = line.match(/^\s*\[remote\s+"(.+)"\]\s*$/i);

    if (sectionMatch) {
      currentRemote = sectionMatch[1];
      continue;
    }

    if (!currentRemote) {
      continue;
    }

    const urlMatch = line.match(/^\s*url\s*=\s*(.+)\s*$/i);

    if (urlMatch && !remotes.has(currentRemote)) {
      remotes.set(currentRemote, urlMatch[1].trim());
    }
  }

  return Array.from(remotes.entries()).map(([name, url]) => ({ name, url }));
}

function pickGitHubRemote(
  remotes: Array<{ name: string; url: string }>,
): GitHubRepository | undefined {
  const origin = remotes.find((remote) => remote.name === "origin");
  const candidateUrls = origin ? [origin.url, ...remotes.map((remote) => remote.url)] : remotes.map((remote) => remote.url);

  for (const url of candidateUrls) {
    const parsed = parseRemoteSpec(url);

    if (parsed) {
      return parsed;
    }
  }

  return undefined;
}

async function loadGitHubSession(): Promise<vscode.AuthenticationSession | undefined> {
  try {
    return await vscode.authentication.getSession(
      "github",
      ["read:user", "repo"],
      {
        createIfNone: false,
      },
    );
  } catch {
    return undefined;
  }
}

async function fetchContributorPage(
  repository: GitHubRepository,
  session: vscode.AuthenticationSession | undefined,
  page: number,
): Promise<GitHubContributorSuggestion[]> {
  const url = new URL(
    `/repos/${repository.owner}/${repository.repo}/contributors`,
    repository.apiBaseUrl,
  );

  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));
  url.searchParams.set("anon", "false");

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (session) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  const response = await fetch(url, {
    headers,
  });

  if (!response.ok) {
    return [];
  }

  const contributors = (await response.json()) as Array<{
    login?: string;
  }>;

  return contributors
    .filter((contributor) => Boolean(contributor.login))
    .map((contributor) => ({
      login: contributor.login as string,
    }));
}

export class GitHubAssigneeSuggestionService {
  private cacheKey: string | undefined;

  private cachedSuggestions: GitHubContributorSuggestion[] = [];

  private pendingLoad: Promise<GitHubContributorSuggestion[]> | undefined;

  constructor(
    private readonly workspaceFolderResolver: () =>
      | vscode.Uri
      | undefined = () => vscode.workspace.workspaceFolders?.[0]?.uri,
  ) {}

  invalidate(): void {
    this.cacheKey = undefined;
    this.cachedSuggestions = [];
    this.pendingLoad = undefined;
  }

  async load(forceRefresh = false): Promise<GitHubContributorSuggestion[]> {
    const workspaceFolder = this.workspaceFolderResolver();

    if (!workspaceFolder) {
      return [];
    }

    const gitConfigPath = await readGitConfig(workspaceFolder);

    let configText: string;

    try {
      configText = await fs.readFile(gitConfigPath, "utf8");
    } catch {
      return [];
    }

    const repository = pickGitHubRemote(parseRemoteUrls(configText));

    if (!repository) {
      return [];
    }

    const cacheKey = [
      workspaceFolder.fsPath,
      repository.apiBaseUrl,
      repository.owner,
      repository.repo,
    ].join("|");

    if (!forceRefresh && this.cacheKey === cacheKey) {
      return [...this.cachedSuggestions];
    }

    if (!forceRefresh && this.pendingLoad && this.cacheKey === cacheKey) {
      return this.pendingLoad;
    }

    const loadPromise = (async () => {
      const session = await loadGitHubSession();

      const suggestions = new Map<string, GitHubContributorSuggestion>();
      let page = 1;

      while (page <= 10) {
        const contributors = await fetchContributorPage(
          repository,
          session,
          page,
        );

        if (contributors.length === 0) {
          break;
        }

        for (const contributor of contributors) {
          suggestions.set(contributor.login.toLowerCase(), contributor);
        }

        if (contributors.length < 100) {
          break;
        }

        page += 1;
      }

      const result = Array.from(suggestions.values()).sort((left, right) =>
        left.login.localeCompare(right.login),
      );

      this.cacheKey = cacheKey;
      this.cachedSuggestions = result;

      return result;
    })();

    this.pendingLoad = loadPromise;

    try {
      return await loadPromise;
    } finally {
      if (this.pendingLoad === loadPromise) {
        this.pendingLoad = undefined;
      }
    }
  }
}
