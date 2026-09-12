import assert from "node:assert/strict";
import { test } from "node:test";
import { addProject, defaultLibrary, parseLibrary } from "../src/projects";
import { scenarios } from "../src/replay";

test("the default project contains all replayable conversations", () => {
  const library = defaultLibrary();
  assert.equal(library.projects.length, 1);
  assert.equal(library.projects[0].name, "meliora-harness");
  assert.equal(library.projects[0].chats.length, scenarios.length);
});

test("a new project receives its own empty conversation", () => {
  const library = addProject(defaultLibrary(), "  example-project  ", "manual");
  assert.equal(library.projects.at(-1)?.name, "example-project");
  assert.equal(library.projects.at(-1)?.chats.length, 1);
  assert.equal(library.projects.at(-1)?.chats[0].title, "新对话");
  assert.equal(library.activeId, library.projects.at(-1)?.chats[0].id);
});

test("invalid browser storage fails closed to the default library", () => {
  assert.equal(parseLibrary("not-json").projects[0].name, "meliora-harness");
  assert.equal(parseLibrary(JSON.stringify({ projects: [], activeId: "missing" })).projects[0].chats.length, scenarios.length);
});

test("oversized browser storage is rejected before rehydration", () => {
  assert.equal(parseLibrary("x".repeat(250_001)).projects[0].name, "meliora-harness");
  const library = defaultLibrary();
  library.projects[0].chats[0].draft = "x".repeat(20_001);
  assert.equal(parseLibrary(JSON.stringify(library)).projects[0].chats.length, scenarios.length);
});
