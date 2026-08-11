import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export interface SshHost {
  /** The host alias, e.g. "prod". */
  name: string;
  /** Human-readable summary shown beside the name, e.g. "ubuntu@1.2.3.4". */
  detail: string;
  /** The raw config directives for this host (key, value), in file order. */
  config: Array<[string, string]>;
}

/** Resolve the OpenSSH client config path for the current platform. */
export function sshConfigPath(): string {
  return path.join(os.homedir(), '.ssh', 'config');
}

/**
 * Parse SSH host aliases (and their full config blocks) from the user's SSH
 * config. Wildcard patterns (Host *, ?, !) are ignored. Duplicates are
 * de-duped, keeping the first occurrence.
 */
export function parseHosts(): SshHost[] {
  let text: string;
  try {
    text = fs.readFileSync(sshConfigPath(), 'utf8');
  } catch {
    return [];
  }

  const hosts: SshHost[] = [];
  let current: { names: string[]; config: Array<[string, string]>; hostName?: string; user?: string } | null = null;

  const flush = () => {
    if (!current) return;
    const detail =
      current.user && current.hostName
        ? `${current.user}@${current.hostName}`
        : current.hostName || current.user || '';
    for (const n of current.names) hosts.push({ name: n, detail, config: current.config });
    current = null;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const m = line.match(/^(\w+)[=\s]+(.*)$/);
    if (!m) continue;

    const key = m[1];
    const keyLower = key.toLowerCase();
    const value = m[2].trim();

    if (keyLower === 'host') {
      flush();
      const names = value.split(/\s+/).filter((p) => p && !/[*?!]/.test(p));
      current = names.length ? { names, config: [] } : null;
    } else if (current) {
      current.config.push([key, value]);
      if (keyLower === 'hostname') current.hostName = value;
      else if (keyLower === 'user') current.user = value;
    }
  }
  flush();

  const seen = new Set<string>();
  return hosts.filter((h) => (seen.has(h.name) ? false : seen.add(h.name)));
}
