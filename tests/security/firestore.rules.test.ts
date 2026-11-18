import { afterAll, beforeAll, describe, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";

let environment: RulesTestEnvironment | undefined;

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Run with `bun run test:rules` to use the local emulator.");
  }

  environment = await initializeTestEnvironment({
    projectId: "demo-grammar-fixer",
    firestore: {
      rules: await readFile(
        new URL("../../firestore.rules", import.meta.url),
        "utf8",
      ),
    },
  });

  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "notes/existing"), { text: "private" });
    await setDoc(doc(context.firestore(), "notes/existing/revisions/original"), {
      text: "private",
    });
  });
}, 30_000);

afterAll(async () => {
  await environment?.cleanup();
}, 15_000);

describe.each(["anonymous", "authenticated"] as const)("%s client", (identity) => {
  const database = () => {
    if (!environment) {
      throw new Error("Security test environment is not initialized.");
    }

    return identity === "anonymous"
      ? environment.unauthenticatedContext().firestore()
      : environment.authenticatedContext("test-user").firestore();
  };

  test("cannot read a document", async () => {
    await assertFails(getDoc(doc(database(), "notes/existing")));
  });

  test("cannot list a collection", async () => {
    await assertFails(getDocs(collection(database(), "notes")));
  });

  test("cannot create a document", async () => {
    await assertFails(setDoc(doc(database(), "notes/new"), { text: "new" }));
  });

  test("cannot update a document", async () => {
    await assertFails(
      updateDoc(doc(database(), "notes/existing"), { text: "changed" }),
    );
  });

  test("cannot delete a document", async () => {
    await assertFails(deleteDoc(doc(database(), "notes/existing")));
  });

  test("cannot read nested documents", async () => {
    await assertFails(
      getDoc(doc(database(), "notes/existing/revisions/original")),
    );
  });
});
