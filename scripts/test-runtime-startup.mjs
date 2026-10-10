import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Verify the service production dependency closure without the root's installed
// dependencies masking packages that Vercel omits from individual service bundles.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(join(tmpdir(), 'chordjai-runtime-'));
const selected = [];
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  !/(?:KEY|SECRET|TOKEN|DATABASE|LINE_|OPENAI)/.test(name)));

function execute(command, args) {
  const result = spawnSync(command, args, { cwd: temporary, env: cleanEnv, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Isolated startup check failed with exit status ${result.status}`);
}

try {
  for (const name of ['package.json', 'package-lock.json']) await cp(join(root, name), join(temporary, name));
  for (const group of ['backend', 'packages', 'frontend']) {
    for (const entry of await readdir(join(root, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const source = join(root, group, entry.name);
      let manifest;
      try { manifest = await readFile(join(source, 'package.json'), 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      const destination = join(temporary, group, entry.name);
      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, 'package.json'), manifest);
      if (group === 'backend') selected.push(JSON.parse(manifest).name);
      if (group !== 'frontend') {
        await cp(join(source, 'src'), join(destination, 'src'), {
          recursive: true,
          filter: path => !/\.(test|spec)\.[cm]?tsx?$/.test(path)
        }).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
    }
  }

  execute(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'ci', '--ignore-scripts', '--omit=dev', '--include-workspace-root=false',
    ...selected.map(name => `--workspace=${name}`)
  ]);
  const probe = join(temporary, 'startup.mjs');
  await writeFile(probe, `
import { readdir } from 'node:fs/promises';
let checked = 0;
for (const service of await readdir('./backend')) {
  const { default: app } = await import('./backend/' + service + '/src/index.ts');
  const response = await app.request('http://localhost/healthz');
  const payload = await response.json();
  if (response.status !== 200 || payload.data?.status !== 'ok') throw new Error(service + ' healthz failed');
  checked++;
}
console.log('Isolated production install: ' + checked + ' services imported and healthz returned 200 without root dependencies or provider credentials.');
`);
  execute(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), probe]);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
