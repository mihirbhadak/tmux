// Publishes this extension to npm as a scoped package.
//
// The VS Code manifest requires `name` to be a plain identifier (vsce rejects
// "@scope/name"), so we can't just rename it in package.json. Instead we stage
// the publishable files into a temp dir with a rewritten manifest and publish
// from there, leaving the source package.json untouched.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const NPM_NAME = '@mihir_bhadak/tmux';
const ROOT = path.join(__dirname, '..');
const INCLUDE = ['out', 'resources', 'README.md', 'CHANGELOG.md'];

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

if (!fs.existsSync(path.join(ROOT, 'out', 'extension.js'))) {
  console.error('out/extension.js is missing — run `npm run compile` first.');
  process.exit(1);
}

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'tmux-npm-'));

for (const entry of INCLUDE) {
  const from = path.join(ROOT, entry);
  if (fs.existsSync(from)) {
    fs.cpSync(from, path.join(stage, entry), { recursive: true });
  }
}

fs.writeFileSync(
  path.join(stage, 'package.json'),
  JSON.stringify({ ...manifest, name: NPM_NAME }, null, 2) + '\n'
);

const args = ['publish', '--access', 'public', ...process.argv.slice(2)];
console.log(`Publishing ${NPM_NAME}@${manifest.version} from ${stage}`);

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, args, { cwd: stage, stdio: 'inherit' });

fs.rmSync(stage, { recursive: true, force: true });
process.exit(result.status ?? 1);
