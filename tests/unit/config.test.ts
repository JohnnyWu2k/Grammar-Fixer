import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const config = JSON.parse(
  await readFile(new URL("../../firebase.json", import.meta.url), "utf8"),
);
const projects = JSON.parse(
  await readFile(new URL("../../.firebaserc.example", import.meta.url), "utf8"),
);

describe("Firebase configuration", () => {
  test("deploys only compiled frontend files, without a Functions runtime", () => {
    expect(config.hosting.public).toBe("dist");
    expect(config.functions).toBeUndefined();
    expect(config.hosting.predeploy).toContain("bun run build");
  });

  test("keeps Firestore security rules available for explicit deployment", () => {
    expect(config.firestore.rules).toBe("firestore.rules");
    expect(config.emulators.firestore.host).toBe("127.0.0.1");
  });

  test("provides a configurable web target without a private project ID", () => {
    expect(config.hosting.target).toBe("web");
    expect(
      projects.targets[projects.projects.default].hosting[config.hosting.target],
    ).toEqual(["your-hosting-site"]);
    expect(projects.projects.default).toBe("your-firebase-project");
  });

  test("blocks framing, unsafe scripts, and sensitive browser permissions", () => {
    const headers = config.hosting.headers.find(
      (entry: { source: string }) => entry.source === "**",
    ).headers as { key: string; value: string }[];
    const value = (key: string) =>
      headers.find((header) => header.key === key)?.value;

    expect(value("Content-Security-Policy")).toContain("script-src 'self'");
    expect(value("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(value("Content-Security-Policy")).not.toContain("'unsafe-inline'");
    expect(value("Content-Security-Policy")).not.toContain("'unsafe-eval'");
    expect(value("X-Content-Type-Options")).toBe("nosniff");
    expect(value("Referrer-Policy")).toBe("no-referrer");
    expect(value("Permissions-Policy")).toContain("microphone=()");
  });
});
