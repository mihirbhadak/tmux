# MySSH

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/mihirbhadak.myssh?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=mihirbhadak.myssh)
[![Open VSX](https://img.shields.io/open-vsx/v/mihirbhadak/myssh?label=Open%20VSX)](https://open-vsx.org/extension/mihirbhadak/myssh)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A lightweight VS Code / Cursor extension that lists the SSH hosts from your
local `~/.ssh/config` in the Activity Bar and opens each one as its own
terminal **editor tab** — `SSH: prod`, `SSH: staging`, `SSH: dev` — all in the
same window.

It runs as a **UI extension** (`"extensionKind": ["ui"]`), so the icon stays
visible and SSH sessions always launch from your **local** machine, even when
the window is attached to a remote host via Remote SSH.

## Features

- **Activity Bar icon** named `MySSH` → searchable list of your hosts.
- **SSH config discovery** — reads `~/.ssh/config`
  (`%USERPROFILE%\.ssh\config` on Windows). Wildcard entries (`Host *`) are
  ignored.
- **Inline search** — a search box sits at the top of the sidebar. Filtering is
  instant and case-insensitive as you type, and stays fast for hundreds of
  hosts (all filtering happens in the view).
- **Single-click to expand** — click a host to reveal its **SSH config block**
  (HostName, User, Port, IdentityFile, …) and its metadata — **last connected**
  (relative time) and **last dir** — plus **Connect** and **Copy** buttons.
- **Right-click a host** for **Connect**, **Copy SSH Command**, **Pin/Unpin**
  and **Hide/Unhide**.
- **Pin / Hide** — pinned hosts (★) sort to the top; hidden hosts drop out of
  the list and appear in a lighter colour. The **eye** button in the view title
  toggles showing hidden hosts so you can unhide them.
- **Open SSH Config** — the ✎ button in the view title (and
  `MySSH: Open SSH Config`) opens `~/.ssh/config` in the editor; saving it
  refreshes the list automatically.
- **Notifications** — a toast on connect and disconnect (the disconnect toast
  has a **Reconnect** button). Toggle with `myssh.notifications`.
- **Double-click to connect** — opens a new terminal editor tab titled
  `SSH: <host>` running `ssh <host>`. Native terminal, no panel clutter.
- **Resume where you left off** — the last remote working directory is
  remembered per host; the next session lands straight there
  (`ssh -t <host> "cd <lastdir>; exec $SHELL -l"`).
- **Multiple sessions** — open as many tabs as you like; each is an independent
  SSH session. Closing a tab ends only that session.
- **Reconnect** — if a session drops, a `Connection closed` notification offers
  a one-click **Reconnect** (back into the same last dir).
- **Copy SSH Command** — the Copy button (and `MySSH: Copy SSH Command`) puts
  `ssh <host>` on the clipboard.

### Keyboard shortcuts (sidebar)

Use the list without the mouse: ↑/↓ move the selection, **Enter** connects, and
**Find** (default `ctrl+f`, configurable via `myssh.keys.find`) focuses the
search box.

### Metadata

`last connected` is stamped on every connect (stored in `globalState`).
`last dir` is stored in a local temp file (`<tmp>/myssh-lastdirs.json`) so the
next session can resume there.

To capture `last dir`, the session is started as
`ssh -tt <host> "cd <lastdir>; export PROMPT_COMMAND='…report cwd…'; exec $SHELL -l"`,
i.e. the **remote** shell reports its working directory each prompt (OSC 7 /
OSC 633). The extension reads those sequences straight off the local ssh
process's output, so capture no longer depends on VS Code shell integration.
This targets POSIX/bash remotes; on shells that ignore `PROMPT_COMMAND` the
session still works, the directory just isn't captured.

SSH itself is handled entirely by OpenSSH — the extension never parses keys or
manages credentials. Make sure `ssh` is on your `PATH` (built into Windows 10+,
macOS, and Linux).

## Commands

| Command               | Title             |
| --------------------- | ----------------- |
| `myssh.refreshHosts`  | Refresh Hosts     |
| `myssh.searchHosts`   | Search Hosts      |
| `myssh.connectHost`   | Connect           |
| `myssh.copyCommand`   | Copy SSH Command  |
| `myssh.openConfig`    | Open SSH Config   |
| `myssh.showHidden`    | Show Hidden Hosts |
| `myssh.hideHidden`    | Hide Hidden Hosts |

All are available in the Command Palette.

## Settings

| Setting               | Default  | Description                                        |
| --------------------- | -------- | -------------------------------------------------- |
| `myssh.notifications` | `true`   | Toast when an SSH session connects or disconnects. |
| `myssh.keys.find`     | `ctrl+f` | Sidebar shortcut to focus the search box.          |

## Remote SSH compatibility

Because of `"extensionKind": ["ui"]`, the extension is **never installed on the
remote server**. It runs in the local extension host, reads the **local** SSH
config, and launches `ssh` from the **local** machine — so the `MySSH` icon and
all sessions keep working while the window is connected to a remote host.

Each session is driven by a `Pseudoterminal`: the `ssh` process is spawned with
`child_process` inside the (local) UI extension host. This is what guarantees
the session runs **locally** even when the window is attached to a remote — a
`shellPath` terminal would instead launch on the remote host (and fail with
`ssh.exe does not exist` on a Linux server). No extension code or `ssh` runs on
the remote.

## Install

**VS Code** — search `MySSH` in the Extensions view, or:

```bash
code --install-extension mihirbhadak.myssh
```

**Cursor** — Cursor installs from
[Open VSX](https://open-vsx.org/extension/mihirbhadak/myssh)
rather than the VS Code Marketplace; search `MySSH` in the Extensions view, or:

```bash
cursor --install-extension mihirbhadak.myssh
```

### From a .vsix

```bash
git clone https://github.com/mihirbhadak/MySSH.git
cd MySSH
npm install
npm run package
code --install-extension myssh-<version>.vsix   # or: cursor --install-extension
```

Or: Extensions view → `...` menu → **Install from VSIX…**

## Build

```bash
npm install
npm run compile   # or: npm run watch
```

Press `F5` in VS Code to launch an Extension Development Host.

## Publishing

```bash
npm run package          # build a .vsix locally
npm run publish:vscode   # VS Code Marketplace (needs an Azure DevOps PAT)
npm run publish:ovsx     # Open VSX, which is what Cursor installs from
```

`vsce` authenticates with `vsce login mihirbhadak` or `VSCE_PAT`; `ovsx` uses
`OVSX_PAT`. Both registries need to be published to for the extension to be
installable in both editors.

The manifest is marked `private` so it can never be published to npm by
accident — this is a VS Code extension, and npm is not a distribution channel
for it.

## Notes / design choices

- **Minimum code, native APIs, zero dependencies.** Sessions use a
  `Pseudoterminal` in an editor tab (`location: TerminalLocation.Editor`); the
  sidebar is a single lightweight webview that does its own filtering. No
  bundler, no React, no terminal emulator dependency.
- **Requires VS Code / Cursor 1.93+.**
- **Pane resize:** the remote pty is sized to the tab on connect and on resize
  (once past auth). On a non-POSIX remote the `stty`/`cd` bootstrap is skipped
  behaviour-wise but the shell still starts.
- The parser reads the main config file only; `Include` directives are not
  expanded.

## License

[MIT](LICENSE) © Mihir Bhadak
