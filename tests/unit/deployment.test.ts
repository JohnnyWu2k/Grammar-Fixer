import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareHostingConfig, prepareHostingDirectory } from "../../scripts/prepare-hosting";
import { isCurrentMainCommit } from "../../scripts/check-main-head";

const firebase = JSON.parse(await readFile(new URL("../../firebase.json", import.meta.url), "utf8"));
const settings = {
  projectId: "example-project",
  siteId: "example-site",
  serviceAccount: JSON.stringify({
    type: "service_account",
    project_id: "example-project",
    client_email: "hosting@example-project.iam.gserviceaccount.com",
    private_key: "test-only-placeholder",
  }),
};

describe("CI deployment configuration", () => {
  test("keeps security headers, strips hooks and excludes non-Hosting resources", () => {
    const source = structuredClone(firebase);
    source.hosting.postdeploy = ["example-hook"];
    const prepared = prepareHostingConfig(source, settings);
    expect(prepared.firebase.hosting.target).toBe("web");
    expect(prepared.firebase.hosting.public).toBe("dist");
    expect(prepared.firebase.hosting.headers).toEqual(source.hosting.headers);
    expect(prepared.firebase.hosting.rewrites).toEqual(source.hosting.rewrites);
    expect(prepared.firebase.hosting.predeploy).toBeUndefined();
    expect(prepared.firebase.hosting.postdeploy).toBeUndefined();
    expect(Object.keys(prepared.firebase)).toEqual(["hosting"]);
    expect(source.hosting.predeploy).toEqual(["bun run build"]);
    expect(source.hosting.postdeploy).toEqual(["example-hook"]);
    expect(prepared.firebaserc.targets["example-project"]?.hosting.web).toEqual(["example-site"]);
    expect(prepared.url).toBe("https://example-site.web.app");
    expect(prepared.url).not.toBe("https://web.web.app");
    expect(JSON.stringify(prepared)).not.toContain("private_key");
    expect(JSON.stringify(prepared)).not.toContain("test-only-placeholder");
  });
  test.each([
    ["projectId", undefined], ["siteId", undefined], ["serviceAccount", undefined],
    ["projectId", "not a project"], ["siteId", "https://example.web.app"],
    ["siteId", "../other-site"], ["serviceAccount", "{invalid-secret-json"],
    ["serviceAccount", "{}"],
    ["serviceAccount", settings.serviceAccount.replace("example-project", "another-project")],
  ])("rejects invalid %s", (key, value) => {
    expect(() => prepareHostingConfig(firebase, { ...settings, [key]: value })).toThrow();
  });
  test("reports credential errors without echoing their contents", () => {
    const secret = "invalid-secret-that-must-stay-private";
    try {
      prepareHostingConfig(firebase, { ...settings, serviceAccount: secret });
      throw new Error("Expected rejection");
    } catch (error) {
      expect((error as Error).message).toContain("valid JSON");
      expect((error as Error).message).not.toContain(secret);
    }
  });
  test("rejects unexpected targets or source directories", () => {
    expect(() => prepareHostingConfig({ hosting: { target: "other", public: "dist" } }, settings)).toThrow();
    expect(() => prepareHostingConfig({ hosting: { target: "web", public: "." } }, settings)).toThrow();
    expect(() => prepareHostingConfig({ hosting: [] }, settings)).toThrow();
  });
});

const temporaryDirectories: string[] = [];
afterAll(async () => {
  for (const directory of temporaryDirectories) await rm(directory, { recursive: true, force: true });
});

describe("isolated Hosting directory", () => {
  test("requires an artifact and preserves local deployment configuration", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "grammend-ci-"));
    temporaryDirectories.push(workspace);
    await writeFile(join(workspace, "firebase.json"), JSON.stringify(firebase));
    await writeFile(join(workspace, ".firebaserc"), "local-settings-stay-here");
    await expect(prepareHostingDirectory(workspace, settings)).rejects.toThrow("Missing validated");
    await mkdir(join(workspace, ".firebase-hosting", "dist"), { recursive: true });
    await writeFile(join(workspace, ".firebase-hosting", "dist", "index.html"), "<h1>Test artifact</h1>");
    await prepareHostingDirectory(workspace, settings);
    expect(await readFile(join(workspace, ".firebaserc"), "utf8")).toBe("local-settings-stay-here");
    expect(JSON.parse(await readFile(join(workspace, "firebase.json"), "utf8"))).toEqual(firebase);
    const prepared = JSON.parse(await readFile(join(workspace, ".firebase-hosting", "firebase.json"), "utf8"));
    expect(prepared.hosting.predeploy).toBeUndefined();
    const rc = JSON.parse(await readFile(join(workspace, ".firebase-hosting", ".firebaserc"), "utf8"));
    expect(rc.targets["example-project"].hosting.web).toEqual(["example-site"]);
  });
  test("entry script exports the real site URL without writing or logging credentials", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "grammend-ci-entry-"));
    temporaryDirectories.push(workspace);
    await writeFile(join(workspace, "firebase.json"), JSON.stringify(firebase));
    await mkdir(join(workspace, ".firebase-hosting", "dist"), { recursive: true });
    await writeFile(join(workspace, ".firebase-hosting", "dist", "index.html"), "<h1>Validated artifact</h1>");
    const outputFile = join(workspace, "github-output");
    const child = Bun.spawn({
      cmd: [process.execPath, fileURLToPath(new URL("../../scripts/prepare-hosting.ts", import.meta.url))],
      cwd: workspace,
      env: {
        ...process.env,
        GITHUB_ACTIONS: "true",
        GITHUB_OUTPUT: outputFile,
        FIREBASE_PROJECT_ID: settings.projectId,
        FIREBASE_HOSTING_SITE: settings.siteId,
        FIREBASE_SERVICE_ACCOUNT: settings.serviceAccount,
      },
      stdout: "pipe", stderr: "pipe",
    });
    const stdout = await new Response(child.stdout).text();
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).toBe(0);
    expect(`${stdout}${stderr}`).not.toContain("test-only-placeholder");
    expect(await readFile(outputFile, "utf8")).toBe("url=https://example-site.web.app\n");
    const generated = await readFile(join(workspace, ".firebase-hosting", ".firebaserc"), "utf8");
    expect(generated).not.toContain("private_key");
  });
});

describe("outdated deployment prevention", () => {
  const sha = "a".repeat(40);
  test("accepts the current SHA and rejects an outdated SHA", async () => {
    const fetcher = async () => Response.json({ object: { sha } });
    expect(await isCurrentMainCommit("example/repository", sha, "test-token", fetcher)).toBe(true);
    expect(await isCurrentMainCommit("example/repository", "b".repeat(40), "test-token", fetcher)).toBe(false);
  });
  test("does not send tokens to arbitrary origins", async () => {
    let called = false;
    await expect(isCurrentMainCommit("https://other.invalid", sha, "test-token", async () => {
      called = true;
      return Response.json({});
    })).rejects.toThrow();
    expect(called).toBe(false);
  });
  test("rejects malformed references and failed requests without reporting response bodies", async () => {
    await expect(isCurrentMainCommit("example/repository", sha, "test-token", async () =>
      Response.json({ object: { sha: "invalid" } }))).rejects.toThrow("invalid main");
    await expect(isCurrentMainCommit("example/repository", sha, "test-token", async () =>
      new Response("private server detail", { status: 403 }))).rejects.toThrow("HTTP 403");
  });
});
