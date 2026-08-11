import * as vscode from 'vscode';
import { parseHosts, SshHost } from './sshConfig';
import { Store } from './store';
import { TerminalManager } from './terminalManager';

interface Keys {
  find: string;
}

/**
 * Sidebar webview: a search box over the SSH hosts. Type to filter; arrow keys
 * (or hover/click) move the selection; double-click or Enter connects;
 * single-click expands a host's config + metadata. Right-click a host for
 * Connect / Copy / Pin / Hide. Pinned hosts (★) sort to the top; hidden hosts
 * drop out of the list unless "show hidden" is on. Filtering is done in the
 * webview so it stays instant for hundreds of hosts.
 */
export class HostsViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private cached: SshHost[] = parseHosts();
  private showHidden = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: Store,
    private readonly terminals: TerminalManager
  ) {
    store.onDidChange(() => this.post());
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((m) => {
      if (m.type === 'connect') this.terminals.connect(m.host);
      else if (m.type === 'copy') vscode.env.clipboard.writeText(`ssh ${m.host}`);
      else if (m.type === 'pin') this.store.setPinned(m.host, !!m.value);
      else if (m.type === 'hide') this.store.setHidden(m.host, !!m.value);
      else if (m.type === 'toggleHidden') this.toggleHidden();
      else if (m.type === 'ready') {
        this.post();
        this.sendKeys();
        this.sendShowHidden();
      }
    });
  }

  refresh(): void {
    this.store.reload();
    this.cached = parseHosts();
    this.post();
  }

  focusSearch(): void {
    this.view?.show(true);
    this.view?.webview.postMessage({ type: 'focus' });
  }

  sendKeys(): void {
    this.view?.webview.postMessage({ type: 'keys', keys: this.readKeys() });
  }

  toggleHidden(): void {
    this.showHidden = !this.showHidden;
    this.sendShowHidden();
  }

  private sendShowHidden(): void {
    vscode.commands.executeCommand('setContext', 'tmux.showHidden', this.showHidden);
    this.view?.webview.postMessage({ type: 'showHidden', value: this.showHidden });
  }

  private readKeys(): Keys {
    const c = vscode.workspace.getConfiguration('tmux.keys');
    return { find: c.get('find', 'ctrl+f') };
  }

  private post(): void {
    if (!this.view) return;
    const hosts = this.cached.map((h) => ({ name: h.name, detail: h.detail, config: h.config, ...this.store.get(h.name) }));
    this.view.webview.postMessage({ type: 'hosts', hosts });
  }

  private html(webview: vscode.Webview): string {
    const nonce = Buffer.from(`${process.pid}-${process.hrtime.bigint()}`).toString('base64');
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<style>
  body { margin: 0; padding: 0; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); }
  #q { position: sticky; top: 0; box-sizing: border-box; width: 100%; padding: 6px 8px; border: 1px solid var(--vscode-input-border, transparent);
       background: var(--vscode-input-background); color: var(--vscode-input-foreground); outline: none; }
  #q:focus { border-color: var(--vscode-focusBorder); }
  #list { padding-top: 6px; }
  #menu { position: fixed; display: none; z-index: 10; min-width: 160px; padding: 4px 0;
          background: var(--vscode-menu-background); color: var(--vscode-menu-foreground);
          border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border, transparent)); box-shadow: 0 2px 8px rgba(0,0,0,0.36); }
  #menu div { padding: 4px 14px; cursor: pointer; white-space: nowrap; }
  #menu div:hover { background: var(--vscode-menu-selectionBackground); color: var(--vscode-menu-selectionForeground); }
  .host { cursor: pointer; user-select: none; }
  .host.hidden { color: var(--vscode-descriptionForeground); }
  .row { display: flex; align-items: center; gap: 6px; padding: 4px 8px; white-space: nowrap; overflow: hidden; }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .row.sel { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .dot { color: var(--vscode-charts-blue, #3794ff); }
  .pin { color: var(--vscode-charts-yellow, #e2c08d); }
  .name { flex: 0 0 auto; }
  .detail { color: var(--vscode-descriptionForeground); overflow: hidden; text-overflow: ellipsis; font-size: 0.9em; }
  .row.sel .detail { color: inherit; opacity: 0.8; }
  .meta { padding: 2px 8px 8px 22px; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .meta .val { color: var(--vscode-foreground); }
  .cfg { margin-bottom: 6px; }
  .cfg div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cfg .k { color: var(--vscode-foreground); font-weight: 600; }
  .btns { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 3px 10px; cursor: pointer; }
  button.sec { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  .empty { padding: 10px 8px; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
<input id="q" placeholder="Search hosts" autocomplete="off" spellcheck="false" />
<div id="list"></div>
<div id="menu"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const q = document.getElementById('q');
  const list = document.getElementById('list');
  const menu = document.getElementById('menu');
  const saved = vscode.getState() || { q: '' };
  q.value = saved.q || '';

  let all = [];
  let shown = [];
  let sel = 0;
  let showHidden = false;
  let menuHost = null;
  const expanded = new Set();
  let keys = { find: 'ctrl+f' };
  let clickTimer;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ago = (ts) => {
    if (!ts) return 'never';
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  };
  const byName = (n) => all.find((h) => h.name === n) || {};

  function parseCombo(s) {
    const p = String(s).toLowerCase().split('+').map((x) => x.trim());
    return {
      ctrl: p.includes('ctrl') || p.includes('cmd') || p.includes('meta'),
      shift: p.includes('shift'),
      alt: p.includes('alt'),
      key: p[p.length - 1],
    };
  }
  function matches(e, combo) {
    const b = parseCombo(combo);
    return (e.ctrlKey || e.metaKey) === b.ctrl && e.shiftKey === b.shift && e.altKey === b.alt && e.key.toLowerCase() === b.key;
  }
  const current = () => shown[sel];

  function render() {
    const term = q.value.trim().toLowerCase();
    shown = all
      .filter((h) => showHidden || !h.hidden)
      .filter((h) => !term || h.name.toLowerCase().includes(term) || (h.detail || '').toLowerCase().includes(term))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    if (sel >= shown.length) sel = shown.length - 1;
    if (sel < 0) sel = 0;
    if (!shown.length) {
      list.innerHTML = '<div class="empty">' + (all.length ? 'No matches' : 'No SSH hosts found') + '</div>';
      return;
    }
    list.innerHTML = shown.map((h, i) => {
      const open = expanded.has(h.name);
      const pin = h.pinned ? '<span class="pin">★</span>' : '<span class="dot">●</span>';
      let html = '<div class="host' + (h.hidden ? ' hidden' : '') + '" data-host="' + esc(h.name) + '" data-i="' + i + '">' +
        '<div class="row' + (i === sel ? ' sel' : '') + '">' + pin + '<span class="name">' + esc(h.name) + '</span>' +
        '<span class="detail">' + esc(h.detail || '') + '</span></div>';
      if (open) {
        const cfg = (h.config || []).map((c) => '<div><span class="k">' + esc(c[0]) + '</span> ' + esc(c[1]) + '</div>').join('');
        html += '<div class="meta">' +
          (cfg ? '<div class="cfg">' + cfg + '</div>' : '') +
          'Last connected: <span class="val">' + ago(h.lastConnected) + '</span><br>' +
          'Last dir: <span class="val">' + esc(h.lastDir || '—') + '</span>' +
          '<div class="btns">' +
          '<button data-act="connect">Connect</button>' +
          '<button class="sec" data-act="copy">Copy</button>' +
          '</div></div>';
      }
      return html;
    }).join('');
    const selEl = list.querySelector('.row.sel');
    if (selEl) selEl.scrollIntoView({ block: 'nearest' });
  }

  function toggle(host) {
    if (expanded.has(host)) expanded.delete(host); else expanded.add(host);
    render();
  }

  function doAct(act, host) {
    const h = byName(host);
    if (act === 'pin') vscode.postMessage({ type: 'pin', host, value: !h.pinned });
    else if (act === 'hide') vscode.postMessage({ type: 'hide', host, value: !h.hidden });
    else vscode.postMessage({ type: act, host });
  }

  function hideMenu() { menu.style.display = 'none'; menuHost = null; }

  q.addEventListener('input', () => { vscode.setState({ q: q.value }); sel = 0; render(); });

  list.addEventListener('click', (e) => {
    const hostEl = e.target.closest('.host');
    if (!hostEl) return;
    sel = parseInt(hostEl.dataset.i, 10);
    const host = hostEl.dataset.host;
    const act = e.target.dataset.act;
    if (act) { doAct(act, host); return; }
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => toggle(host), 180);
  });

  list.addEventListener('dblclick', (e) => {
    const hostEl = e.target.closest('.host');
    if (!hostEl || e.target.dataset.act) return;
    clearTimeout(clickTimer);
    vscode.postMessage({ type: 'connect', host: hostEl.dataset.host });
  });

  list.addEventListener('contextmenu', (e) => {
    const hostEl = e.target.closest('.host');
    if (!hostEl) return;
    e.preventDefault();
    sel = parseInt(hostEl.dataset.i, 10);
    render();
    menuHost = hostEl.dataset.host;
    const h = byName(menuHost);
    menu.innerHTML =
      '<div data-act="connect">Connect</div>' +
      '<div data-act="copy">Copy SSH Command</div>' +
      '<div data-act="pin">' + (h.pinned ? 'Unpin' : 'Pin') + '</div>' +
      '<div data-act="hide">' + (h.hidden ? 'Unhide' : 'Hide') + '</div>';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.style.display = 'block';
  });

  menu.addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (act && menuHost) doAct(act, menuHost);
    hideMenu();
  });

  window.addEventListener('click', hideMenu);
  window.addEventListener('scroll', hideMenu, true);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideMenu(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (sel < shown.length - 1) { sel++; render(); } return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (sel > 0) { sel--; render(); } return; }
    if (e.key === 'Enter') { const h = current(); if (h) { e.preventDefault(); vscode.postMessage({ type: 'connect', host: h.name }); } return; }
    if (matches(e, keys.find)) { e.preventDefault(); q.focus(); q.select(); return; }
  });

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'hosts') { all = m.hosts; render(); }
    else if (m.type === 'showHidden') { showHidden = m.value; render(); }
    else if (m.type === 'keys') { keys = m.keys; }
    else if (m.type === 'focus') { q.focus(); q.select(); }
  });

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}
