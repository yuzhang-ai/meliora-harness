import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { canaryGitEnvironment } from "../verification/canary-git-env";

test("canary Git and its helpers never inherit Provider credentials or user Git configuration", () => {
  const fakeKey = "synthetic-pr41-secret";
  const env = canaryGitEnvironment({
    ...process.env,
    MELIORA_API_KEY: fakeKey,
    MELIORA_GATEWAY_BASE_URL: "https://example.invalid/v1",
    HOME: "/untrusted/git/home",
    GIT_CONFIG_GLOBAL: "/untrusted/git/config",
    GIT_CONFIG_COUNT: "1",
  });
  assert.equal(env.MELIORA_API_KEY, undefined);
  assert.equal(env.MELIORA_GATEWAY_BASE_URL, undefined);
  assert.equal(env.HOME, undefined);
  assert.equal(env.GIT_CONFIG_COUNT, undefined);
  assert.equal(env.GIT_CONFIG_NOSYSTEM, "1");
  assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  assert.equal(env.GIT_CONFIG_GLOBAL, process.platform === "win32" ? "NUL" : "/dev/null");
  // An external helper launched by Git inherits this child environment, not the canary's parent environment.
  const helperVisibleKey = execFileSync(process.execPath, ["-e", "process.stdout.write(process.env.MELIORA_API_KEY ?? '')"], {
    env,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(helperVisibleKey, "");
});
