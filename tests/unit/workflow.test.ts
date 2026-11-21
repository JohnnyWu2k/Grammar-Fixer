import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
interface Job {
  needs?: string;
  if?: string;
  steps: Step[];
  concurrency: { group: string; "cancel-in-progress": boolean };
}
const workflow = Bun.YAML.parse(await readFile(
  new URL("../../.github/workflows/firebase-hosting.yml", import.meta.url), "utf8",
)) as {
  on: Record<string, { branches?: string[] } | null>;
  permissions: Record<string, string>;
  jobs: Record<"validate" | "deploy", Job>;
};

describe("GitHub deployment workflow", () => {
  test("supports main pushes, PR validation and manual runs without privileged PR events", () => {
    expect(workflow.on.push?.branches).toEqual(["main"]);
    expect(workflow.on.pull_request?.branches).toEqual(["main"]);
    expect(Object.hasOwn(workflow.on, "workflow_dispatch")).toBe(true);
    expect(Object.hasOwn(workflow.on, "pull_request_target")).toBe(false);
    expect(workflow.permissions).toEqual({ contents: "read" });
  });
  test("keeps validation credential-free and gates deployment behind a successful main build", () => {
    expect(JSON.stringify(workflow.jobs.validate)).not.toContain("secrets");
    expect(workflow.jobs.deploy.needs).toBe("validate");
    expect(workflow.jobs.deploy.if).toContain("refs/heads/main");
    expect(workflow.jobs.deploy.if).toContain("github.event_name == 'push'");
    expect(workflow.jobs.deploy.if).not.toContain("pull_request");
    expect(workflow.jobs.deploy.concurrency["cancel-in-progress"]).toBe(false);
  });
  test("uses the same artifact instead of rebuilding during deployment", () => {
    const upload = workflow.jobs.validate.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
    const download = workflow.jobs.deploy.steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
    expect(upload?.with?.path).toBe("dist/");
    expect(upload?.with?.["if-no-files-found"]).toBe("error");
    expect(download?.with?.name).toBe(upload?.with?.name);
    expect(download?.with?.path).toBe(".firebase-hosting/dist");
    expect(download?.with?.["digest-mismatch"]).toBe("error");
    expect(workflow.jobs.deploy.steps.some((step) => step.run?.includes("bun run build"))).toBe(false);
  });
  test("publishes only live Hosting with explicit configuration and a locked CLI version", () => {
    const deploy = workflow.jobs.deploy.steps.find((step) => step.uses?.startsWith("FirebaseExtended/"));
    expect(deploy?.with?.channelId).toBe("live");
    expect(deploy?.with?.target).toBe("web");
    expect(deploy?.with?.entryPoint).toBe(".firebase-hosting");
    expect(deploy?.with?.projectId).toContain("vars.FIREBASE_PROJECT_ID");
    const configuration = workflow.jobs.deploy.steps.find((step) => step.run === "bun scripts/prepare-hosting.ts");
    const serviceAccountSecret = "${{ secrets.FIREBASE_SERVICE_ACCOUNT }}";
    expect(configuration?.env?.FIREBASE_SERVICE_ACCOUNT).toBe(serviceAccountSecret);
    expect(deploy?.with?.firebaseServiceAccount).toBe(serviceAccountSecret);
    expect(deploy?.with?.firebaseToolsVersion).toContain("needs.validate.outputs.firebase_cli_version");
    expect(deploy?.if).toContain("steps.current.outputs.current == 'true'");
    expect(workflow.jobs.deploy.steps.some((step) => step.run === "bun scripts/check-main-head.ts")).toBe(true);
    const verify = workflow.jobs.deploy.steps.find((step) => step.name === "Verify live website");
    expect(verify?.env?.DEPLOY_URL).toContain("steps.configuration.outputs.url");
    expect(verify?.run).toContain("curl --fail");
  });
  test("pins all actions to immutable commit SHAs", () => {
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps) {
        if (step.uses) expect(step.uses).toMatch(/^[\w-]+\/[\w-]+@[a-f0-9]{40}$/);
      }
    }
  });
});
