import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { localServerGitEnvironment } from "../src/local-git-environment.js";

const execFileAsync = promisify(execFile);

test("local Server Git environment keeps only OS essentials on Windows and POSIX", () => {
  const source: NodeJS.ProcessEnv = {
    PATH: "synthetic-path",
    SystemRoot: "C:\\Windows",
    ComSpec: "C:\\Windows\\System32\\cmd.exe",
    PATHEXT: ".EXE;.CMD",
    TEMP: "C:\\Temp",
    TMP: "C:\\Temp",
    TMPDIR: "/tmp",
    LANG: "C.UTF-8",
    MELIORA_API_KEY: "synthetic-provider-secret",
    MELIORA_GATEWAY_BASE_URL: "https://gateway.example.invalid/v1",
    MELIORA_TRUSTED_PROVIDER_ORIGIN: "https://gateway.example.invalid",
    HOME: "/untrusted/home",
    XDG_CONFIG_HOME: "/untrusted/xdg",
    GIT_CONFIG_GLOBAL: "/untrusted/gitconfig",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.fsmonitor",
    GIT_CONFIG_VALUE_0: "malicious-helper",
  };

  const windows = localServerGitEnvironment(source, "win32");
  assert.deepEqual(windows, {
    GIT_CONFIG_GLOBAL: "NUL",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PAGER: "cat",
    GIT_TERMINAL_PROMPT: "0",
    PATH: source.PATH,
    SystemRoot: source.SystemRoot,
    ComSpec: source.ComSpec,
    PATHEXT: source.PATHEXT,
    TEMP: source.TEMP,
    TMP: source.TMP,
  });

  const posix = localServerGitEnvironment(source, "linux");
  assert.deepEqual(posix, {
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PAGER: "cat",
    GIT_TERMINAL_PROMPT: "0",
    PATH: source.PATH,
    TMPDIR: source.TMPDIR,
    LANG: source.LANG,
  });
  for (const environment of [windows, posix] as NodeJS.ProcessEnv[]) {
    assert.equal(environment.MELIORA_API_KEY, undefined);
    assert.equal(environment.MELIORA_GATEWAY_BASE_URL, undefined);
    assert.equal(environment.MELIORA_TRUSTED_PROVIDER_ORIGIN, undefined);
    assert.equal(environment.HOME, undefined);
    assert.equal(environment.XDG_CONFIG_HOME, undefined);
    assert.equal(environment.GIT_CONFIG_COUNT, undefined);
  }
});

test("malicious user Git configuration and helpers cannot observe the local Server model key", async () => {
  const parent = await mkdtemp(join(tmpdir(), "meliora-local-git-env-"));
  const fakeHome = join(parent, "malicious-home");
  const fakeKey = "synthetic-local-server-model-key";
  try {
    await mkdir(fakeHome);
    const credentialBearingParent = { ...process.env, HOME: fakeHome, MELIORA_API_KEY: fakeKey };
    await execFileAsync("git", ["config", "--global", "core.fsmonitor", "malicious-helper"], {
      env: credentialBearingParent,
      windowsHide: true,
    });
    const configured = await execFileAsync("git", ["config", "--global", "--get", "core.fsmonitor"], {
      env: credentialBearingParent,
      windowsHide: true,
    });
    assert.equal(configured.stdout.trim(), "malicious-helper");

    const safeEnvironment = localServerGitEnvironment(credentialBearingParent);
    await assert.rejects(execFileAsync("git", ["config", "--global", "--get", "core.fsmonitor"], {
      env: safeEnvironment,
      windowsHide: true,
    }), (error: unknown) => typeof error === "object" && error !== null && (error as { code?: unknown }).code === 1);
    const helperProbe = await execFileAsync(process.execPath, ["-e", "process.stdout.write(process.env.MELIORA_API_KEY ?? '')"], {
      env: safeEnvironment,
      windowsHide: true,
    });
    assert.equal(helperProbe.stdout, "", "a Git-launched helper would inherit the model credential");
  } finally {
    await rm(parent, { recursive: true, force: true, maxRetries: 3 });
  }
});
