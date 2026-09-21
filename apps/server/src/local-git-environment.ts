const WINDOWS_GIT_ENV_ALLOWLIST = ["PATH", "SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP"] as const;
const POSIX_GIT_ENV_ALLOWLIST = ["PATH", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE"] as const;

/**
 * Git started by the credential-bearing local Server receives only OS
 * essentials. In particular, Provider configuration, HOME/XDG config and
 * caller-controlled GIT_* overrides never cross the child-process boundary.
 */
export function localServerGitEnvironment(
  source: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    GIT_CONFIG_GLOBAL: platform === "win32" ? "NUL" : "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PAGER: "cat",
    GIT_TERMINAL_PROMPT: "0",
  };
  const allowlist = platform === "win32" ? WINDOWS_GIT_ENV_ALLOWLIST : POSIX_GIT_ENV_ALLOWLIST;
  for (const name of allowlist) {
    const value = source[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}
