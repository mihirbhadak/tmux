# Changelog

## 0.7.1

- Published to npm as [`@mihir_bhadak/tmux`](https://www.npmjs.com/package/@mihir_bhadak/tmux).
- Added a `LICENSE` file (the manifest already declared MIT), plus `author`,
  `keywords`, `repository`, `homepage` and `bugs` metadata.
- Docs: removed a stale note about `src/webviewTerminal.ts` and an
  `@xterm/xterm` dependency, both dropped in 0.4.0; documented the three
  commands and two settings that were missing; added install instructions that
  no longer reference a hard-coded 0.1.0 vsix.

## 0.7.0

- Pin/Unpin and Hide/Unhide moved to a **right-click context menu** (with
  Connect and Copy SSH Command); removed those buttons from the expanded panel.
- Removed the copy/cut/paste sidebar shortcuts and their settings (only the
  configurable Find shortcut remains).
- Hidden hosts now render in a lighter colour; added a gap between the search
  box and the first host; removed the search icon from the view title.

## 0.6.0

- Added an eye button in the view title (next to search) to show/hide hidden
  hosts; the icon reflects state (eye / eye-closed) and stays in sync with the
  inline "Show N hidden" toggle.

## 0.5.1

- Fixed **Reconnect** from the disconnect notification not opening a tab when
  the original tab had already been closed — it now opens a fresh session tab.

## 0.5.0

- Added **Open SSH Config** button (view title) / `tmux.openConfig` command.
- Connect / disconnect notifications, toggleable via `tmux.notifications`.
- **Pin** and **Hide** hosts from the expanded panel; pinned hosts sort to the
  top and a "Show N hidden" toggle reveals hidden hosts. State persists in
  globalState.

## 0.4.0

- Fixed sessions failing with `ssh.exe does not exist` / launching on the wrong
  machine when the window is attached to a remote via Remote SSH. Sessions now
  run through a local `Pseudoterminal`, so `ssh` always executes on the local
  machine regardless of remote attachment.
- `last dir` is now captured by reading the local ssh output directly (no shell
  integration needed), and the remote pty is sized to the tab.
- Removed the `@xterm/xterm` dependency and webview fallback — the extension now
  has zero runtime dependencies.

## 0.3.0

- Expanded panel now shows the host's full SSH config block (HostName, User,
  Port, IdentityFile, …) alongside the metadata.
- Fixed `last dir`: the remote shell now reports its cwd each prompt (OSC 7 /
  OSC 633) and the session cds back into it, so it is reliably captured and
  resumed on bash/POSIX remotes. (VS Code never injects shell integration into
  an `ssh` terminal, so the old approach never reported a cwd.)

## 0.2.0

- Configurable sidebar shortcuts (`tmux.keys.*`): find / copy / cut / paste,
  defaulting to Ctrl+F/C/X/V. Arrow-key navigation and Enter to connect.
- Sidebar is now a webview with an inline, instant search box.
- Single-click a host to expand its metadata; double-click to connect.
- Per-host metadata: last connected time and last remote directory.
- Sessions resume in the last directory; reconnect returns there too.
- Connect / Copy buttons in the expanded panel.
- Requires VS Code / Cursor 1.93+.

## 0.1.0

- Initial release.
- Activity Bar `tmux` view listing hosts from the local SSH config.
- Connect a host as a `SSH: <host>` terminal editor tab.
- QuickPick search, auto-refresh on config change, reconnect on drop.
- Right-click Connect / Copy SSH Command.
- Runs as a UI extension — stays local under Remote SSH.
