import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { Store } from './store';
import { remoteInit, CWD_RE } from './remote';

const SSH = process.platform === 'win32' ? 'ssh.exe' : 'ssh';

/**
 * A single SSH session backed by a Pseudoterminal. The ssh process is spawned
 * with child_process *inside the extension host*. Because this is a UI
 * extension, the extension host is always LOCAL — so the session runs from the
 * local machine even when the window is attached to a remote via Remote SSH.
 * (A shellPath terminal would instead launch on the remote host.)
 *
 * Reading the stream locally also lets us capture the remote cwd reliably and
 * size the remote pty to the tab.
 */
class SshSession implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  readonly onDidWrite = this.writeEmitter.event;
  private readonly closeEmitter = new vscode.EventEmitter<void>();
  readonly onDidClose = this.closeEmitter.event;
  private readonly endEmitter = new vscode.EventEmitter<void>();
  /** Fires when ssh exits but the tab is kept open for reconnect. */
  readonly onDidEnd = this.endEmitter.event;
  private readonly connectEmitter = new vscode.EventEmitter<void>();
  /** Fires once the session produces output (treated as "connected"). */
  readonly onDidConnect = this.connectEmitter.event;

  private child?: ChildProcess;
  private cols?: number;
  private rows?: number;
  private ready = false;
  private ended = false;

  constructor(private readonly host: string, private readonly store: Store) {}

  open(dims?: vscode.TerminalDimensions): void {
    this.cols = dims?.columns;
    this.rows = dims?.rows;
    this.start();
  }

  close(): void {
    this.child?.kill();
  }

  handleInput(data: string): void {
    if (this.ended) {
      if (data.includes('\r')) this.start(); // Enter reconnects
      return;
    }
    this.child?.stdin?.write(data);
  }

  setDimensions(dims: vscode.TerminalDimensions): void {
    this.cols = dims.columns;
    this.rows = dims.rows;
    // Resize the remote pty — but only once the session is past auth, so we
    // never inject into a password prompt.
    if (this.ready && this.child && !this.ended) {
      this.child.stdin?.write(`stty cols ${dims.columns} rows ${dims.rows} 2>/dev/null\n`);
    }
  }

  private start(): void {
    this.ended = false;
    this.ready = false;
    void this.store.touch(this.host);
    const dir = this.store.get(this.host).lastDir;
    const child = spawn(SSH, ['-tt', this.host, remoteInit(dir, this.cols, this.rows)], { windowsHide: true });
    this.child = child;

    child.stdout?.on('data', (d: Buffer) => {
      const s = d.toString('utf8');
      if (!this.ready) {
        this.ready = true;
        this.connectEmitter.fire();
      }
      this.writeEmitter.fire(s);
      for (const m of s.matchAll(CWD_RE)) if (m[1]) this.store.setDir(this.host, m[1]);
    });
    // ssh diagnostics use bare "\n"; normalise so they don't stair-step.
    child.stderr?.on('data', (d: Buffer) => this.writeEmitter.fire(d.toString('utf8').replace(/\r?\n/g, '\r\n')));
    child.on('error', (e) => this.writeEmitter.fire(`\r\n\x1b[31m${e.message}\x1b[0m\r\n`));
    child.on('exit', () => {
      this.ended = true;
      this.child = undefined;
      this.writeEmitter.fire('\r\n\x1b[31mConnection closed\x1b[0m — press Enter to reconnect.\r\n');
      this.endEmitter.fire();
    });
  }
}

/** Opens each SSH host as its own local terminal editor tab ("SSH: <host>"). */
export class TerminalManager {
  constructor(private readonly store: Store) {}

  private notify(): boolean {
    return vscode.workspace.getConfiguration('tmux').get('notifications', true);
  }

  connect(host: string): void {
    const pty = new SshSession(host, this.store);
    const terminal = vscode.window.createTerminal({
      name: `SSH: ${host}`,
      pty,
      location: vscode.TerminalLocation.Editor,
    });
    pty.onDidConnect(() => {
      if (this.notify()) vscode.window.showInformationMessage(`SSH: ${host} — connected`);
    });
    pty.onDidEnd(() => {
      if (!this.notify()) return;
      vscode.window
        .showInformationMessage(`SSH: ${host} — disconnected`, 'Reconnect')
        .then((choice) => {
          if (choice === 'Reconnect') {
            // The old tab may already be closed, so open a fresh session
            // instead of reusing this (possibly disposed) terminal.
            terminal.dispose();
            this.connect(host);
          }
        });
    });
    terminal.show();
  }
}
