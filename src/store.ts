import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export interface HostMeta {
  /** Epoch ms of the last connect. */
  lastConnected?: number;
  /** Last remote working directory seen. */
  lastDir?: string;
  /** Pinned hosts sort to the top of the sidebar. */
  pinned?: boolean;
  /** Hidden hosts are excluded from the sidebar unless "show hidden" is on. */
  hidden?: boolean;
}

/** Local temp file that mirrors each host's last directory. */
const DIR_FILE = path.join(os.tmpdir(), 'tmux-lastdirs.json');

type MetaMap = Record<string, { lastConnected?: number; pinned?: boolean; hidden?: boolean }>;

/**
 * Per-host metadata. lastConnected/pinned/hidden live in globalState; lastDir is
 * kept in a JSON file under the local temp dir so the next connection can resume
 * there. Any write fires onDidChange so the sidebar updates instantly.
 */
export class Store {
  private static readonly KEY = 'tmux.meta';
  private dirs: Record<string, string> = {};
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly memento: vscode.Memento) {
    this.reload();
  }

  /** Re-read last dirs from the local temp file (used on refresh). */
  reload(): void {
    try {
      this.dirs = JSON.parse(fs.readFileSync(DIR_FILE, 'utf8'));
    } catch {
      this.dirs = {};
    }
  }

  private saveDirs(): void {
    try {
      fs.writeFileSync(DIR_FILE, JSON.stringify(this.dirs));
    } catch {
      /* temp is best-effort */
    }
  }

  private meta(): MetaMap {
    return this.memento.get(Store.KEY, {});
  }

  get(host: string): HostMeta {
    return { ...(this.meta()[host] ?? {}), lastDir: this.dirs[host] };
  }

  private async patch(host: string, patch: Partial<MetaMap[string]>): Promise<void> {
    const all = this.meta();
    all[host] = { ...all[host], ...patch };
    await this.memento.update(Store.KEY, all);
    this._onDidChange.fire();
  }

  touch(host: string): Thenable<void> {
    return this.patch(host, { lastConnected: Date.now() });
  }

  setPinned(host: string, pinned: boolean): Thenable<void> {
    return this.patch(host, { pinned });
  }

  setHidden(host: string, hidden: boolean): Thenable<void> {
    return this.patch(host, { hidden });
  }

  setDir(host: string, dir: string): void {
    if (!dir || this.dirs[host] === dir) return;
    this.dirs[host] = dir;
    this.saveDirs();
    this._onDidChange.fire();
  }
}
