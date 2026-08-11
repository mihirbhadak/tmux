/** Shared helpers for launching SSH and capturing the remote working directory. */

/** POSIX single-quote a string for safe interpolation into a remote command. */
export function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Remote bootstrap run by `ssh -t <host> "<this>"`.
 *
 * 1. cd into the last directory (if known) so the session resumes there.
 * 2. Make every prompt report the cwd via OSC 7 and VS Code's OSC 633, so the
 *    editor can capture it — VS Code does not inject shell integration into an
 *    `ssh` terminal, which is why plain sessions never reported a cwd.
 * 3. Hand off to an interactive login shell.
 *
 * Targets POSIX/bash remotes (the common case); on shells that ignore
 * PROMPT_COMMAND the cwd simply isn't captured and the session still works.
 */
export function remoteInit(dir?: string, cols?: number, rows?: number): string {
  const size = cols && rows ? `stty cols ${cols} rows ${rows} 2>/dev/null; ` : '';
  const cd = dir ? `cd ${shq(dir)} 2>/dev/null; ` : '';
  const report =
    `export PROMPT_COMMAND='printf "\\033]7;file://%s%s\\007\\033]633;P;Cwd=%s\\007" "$HOSTNAME" "$PWD" "$PWD"'`;
  return `${size}${cd}${report}; exec "\${SHELL:-bash}" -l`;
}

/** Matches the cwd reported by remoteInit (OSC 7 or OSC 633;P;Cwd). */
export const CWD_RE = /\x1b\](?:7;file:\/\/[^/]*|633;P;Cwd=)([^\x07\x1b]*)\x07/g;
