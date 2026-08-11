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
const INCLUDE = ['out', 'resources', 'README.md', 'CHANGELOG.md', 'LICENSE'];

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

// `private` guards the source manifest against an accidental bare `npm publish`
// in the project root; the staged copy is the only thing meant to go out.
//
// `files` lives here rather than in the source manifest because vsce refuses to
// run when a package.json "files" property and a .vscodeignore both exist.
const staged = { ...manifest, name: NPM_NAME, files: INCLUDE };
delete staged.private;

fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(staged, null, 2) + '\n');

// An .npmignore (even empty) stops npm falling back to .gitignore, which
// excludes out/ — the very thing we need to ship.
fs.writeFileSync(path.join(stage, '.npmignore'), '');

const args = ['publish', '--access', 'public', ...process.argv.slice(2)];
console.log(`Publishing ${NPM_NAME}@${manifest.version} from ${stage}\n`);

// npm is npm.cmd on Windows, which Node refuses to spawn without a shell
// (CVE-2024-27980). Without `shell` this fails EINVAL and prints nothing.
const result = spawnSync('npm', args, { cwd: stage, stdio: 'inherit', shell: true });

fs.rmSync(stage, { recursive: true, force: true });

if (result.error) {
  console.error(`Failed to run npm: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
