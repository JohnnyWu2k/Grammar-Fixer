import { appendFile, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface DeploymentSettings {
  projectId?: string;
  siteId?: string;
  serviceAccount?: string;
}

export class DeploymentConfigError extends Error {}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function prepareHostingConfig(source: unknown, settings: DeploymentSettings) {
  const project = settings.projectId?.trim();
  const site = settings.siteId?.trim();
  if (!project) throw new DeploymentConfigError("Missing repository variable FIREBASE_PROJECT_ID.");
  if (!site) throw new DeploymentConfigError("Missing repository variable FIREBASE_HOSTING_SITE.");
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) {
    throw new DeploymentConfigError("FIREBASE_PROJECT_ID is not a valid Firebase project ID.");
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(site)) {
    throw new DeploymentConfigError("FIREBASE_HOSTING_SITE is not a valid Hosting site ID.");
  }
  if (!settings.serviceAccount?.trim()) {
    throw new DeploymentConfigError(
      "Missing Firebase service account secret. Configure FIREBASE_SERVICE_ACCOUNT.",
    );
  }
  let account: unknown;
  try {
    account = JSON.parse(settings.serviceAccount);
  } catch {
    throw new DeploymentConfigError("The Firebase service account secret must contain valid JSON.");
  }
  if (!record(account) || account.type !== "service_account"
    || typeof account.client_email !== "string"
    || !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(account.client_email)
    || typeof account.private_key !== "string" || !account.private_key.trim()) {
    throw new DeploymentConfigError("The Firebase service account secret is missing required credential fields.");
  }
  if (account.project_id !== project) {
    throw new DeploymentConfigError(
      "The Firebase service account belongs to a different project than FIREBASE_PROJECT_ID.",
    );
  }
  if (!record(source) || !record(source.hosting)
    || source.hosting.target !== "web" || source.hosting.public !== "dist") {
    throw new DeploymentConfigError("Expected a single Hosting configuration with target web and public dist.");
  }
  const hosting = { ...source.hosting };
  // CI deploys the artifact already built by validate; local hooks stay unchanged.
  delete hosting.predeploy;
  delete hosting.postdeploy;
  return {
    url: `https://${site}.web.app`,
    firebase: { hosting },
    firebaserc: {
      projects: { default: project },
      targets: { [project]: { hosting: { web: [site] } } },
    },
  };
}

export async function prepareHostingDirectory(
  workspace: string, settings: DeploymentSettings,
): Promise<{ url: string }> {
  const source: unknown = JSON.parse(await readFile(join(workspace, "firebase.json"), "utf8"));
  const config = prepareHostingConfig(source, settings);
  const directory = join(workspace, ".firebase-hosting");
  try {
    const entry = await stat(join(directory, "dist", "index.html"));
    if (!entry.isFile() || entry.size === 0) throw new Error("Empty artifact");
  } catch {
    throw new DeploymentConfigError("Missing validated website artifact: .firebase-hosting/dist/index.html.");
  }
  await writeFile(join(directory, "firebase.json"), `${JSON.stringify(config.firebase, null, 2)}\n`);
  await writeFile(join(directory, ".firebaserc"), `${JSON.stringify(config.firebaserc, null, 2)}\n`);
  return { url: config.url };
}

if (import.meta.main) {
  try {
    if (process.env.GITHUB_ACTIONS !== "true") {
      throw new DeploymentConfigError("This script is intended for GitHub Actions.");
    }
    const config = await prepareHostingDirectory(process.cwd(), {
      projectId: process.env.FIREBASE_PROJECT_ID,
      siteId: process.env.FIREBASE_HOSTING_SITE,
      serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT,
    });
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, `url=${config.url}\n`);
    }
    console.log("CI Hosting configuration ready. The validated artifact will be deployed without rebuilding.");
  } catch (error) {
    console.error(`::error::${error instanceof DeploymentConfigError
      ? error.message : "Unable to read or write CI Hosting configuration."}`);
    process.exitCode = 1;
  }
}
