import { appendFile } from "node:fs/promises";

type Fetcher = (url: string, options: RequestInit) => Promise<Response>;

export async function isCurrentMainCommit(
  repository: string, sha: string, token: string, fetcher: Fetcher = fetch,
): Promise<boolean> {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    || !/^[a-f0-9]{40}$/.test(sha) || !token) {
    throw new Error("Missing or invalid GitHub deployment context.");
  }
  const response = await fetcher(
    `https://api.github.com/repos/${repository}/git/ref/heads/main`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error(`Unable to read the latest main commit (HTTP ${response.status}).`);
  const result: unknown = await response.json();
  if (typeof result !== "object" || result === null || !("object" in result)
    || typeof result.object !== "object" || result.object === null
    || !("sha" in result.object) || typeof result.object.sha !== "string"
    || !/^[a-f0-9]{40}$/.test(result.object.sha)) {
    throw new Error("GitHub returned an invalid main branch reference.");
  }
  return result.object.sha === sha;
}

if (import.meta.main) {
  try {
    if (process.env.GITHUB_ACTIONS !== "true" || !process.env.GITHUB_OUTPUT
      || process.env.GITHUB_REF !== "refs/heads/main") {
      throw new Error("This script requires a GitHub Actions main-branch deployment context.");
    }
    const current = await isCurrentMainCommit(
      process.env.GITHUB_REPOSITORY ?? "",
      process.env.GITHUB_SHA ?? "",
      process.env.GITHUB_TOKEN ?? "",
    );
    await appendFile(process.env.GITHUB_OUTPUT, `current=${current}\n`);
    if (!current && process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY,
        "## Deployment skipped\n\nA newer commit exists on main. This run will not overwrite the newer website.\n");
    }
  } catch {
    console.error("::error::Unable to verify the current main commit. Deployment stopped.");
    process.exitCode = 1;
  }
}
