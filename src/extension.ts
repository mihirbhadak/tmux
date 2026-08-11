import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HostsViewProvider } from './hostsView';
import { TerminalManager } from './terminalManager';
import { Store } from './store';
import { sshConfigPath } from './sshConfig';

function hostOf(arg: unknown): string | undefined {
  if (typeof arg === 'string') return arg;
  if (arg && typeof (arg as { host?: string }).host === 'string') return (arg as { host: string }).host;
  return undefined;
}

export function activate(context: vscode.ExtensionContext): void {
  const store = new Store(context.globalState);
  const terminals = new TerminalManager(store);
  const view = new HostsViewProvider(context.extensionUri, store, terminals);
  vscode.commands.executeCommand('setContext', 'tmux.showHidden', false);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('tmux.hosts', view, {
      webviewOptions: { retainContextWhenHidden: true },
    }),

    vscode.commands.registerCommand('tmux.refreshHosts', () => view.refresh()),
    vscode.commands.registerCommand('tmux.searchHosts', () => view.focusSearch()),

    vscode.commands.registerCommand('tmux.connectHost', (arg) => {
      const host = hostOf(arg);
      if (host) terminals.connect(host);
    }),

    vscode.commands.registerCommand('tmux.copyCommand', (arg) => {
      const host = hostOf(arg);
      if (host) vscode.env.clipboard.writeText(`ssh ${host}`);
    }),

    vscode.commands.registerCommand('tmux.showHidden', () => view.toggleHidden()),
    vscode.commands.registerCommand('tmux.hideHidden', () => view.toggleHidden()),

    vscode.commands.registerCommand('tmux.openConfig', async () => {
      const p = sshConfigPath();
      if (!fs.existsSync(p)) {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, '');
      }
      await vscode.window.showTextDocument(vscode.Uri.file(p));
    }),

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('tmux.keys')) view.sendKeys();
    })
  );

  // Re-read hosts whenever the SSH config changes. Watch the directory so
  // create/delete/rename of the config file are all picked up.
  try {
    const dir = path.dirname(sshConfigPath());
    const file = path.basename(sshConfigPath());
    if (fs.existsSync(dir)) {
      let timer: NodeJS.Timeout | undefined;
      const watcher = fs.watch(dir, (_event, changed) => {
        if (changed && changed !== file) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => view.refresh(), 200);
      });
      context.subscriptions.push({ dispose: () => watcher.close() });
    }
  } catch {
    /* watching is best-effort; the refresh button always works */
  }
}

export function deactivate(): void {
  /* nothing to clean up beyond context.subscriptions */
}
