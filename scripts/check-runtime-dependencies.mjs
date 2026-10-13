import { readdir, readFile, stat } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Vercel installs each selected workspace's dependency graph. A root install
// can mask missing declarations, including relative imports of workspace code.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));
const missing = [];
let checked = 0;

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && !['node_modules', 'public'].includes(entry.name)) files.push(...await sourceFiles(path));
    else if (/\.[cm]?tsx?$/.test(entry.name) && !/\.(test|spec|d)\./.test(entry.name)) files.push(path);
  }
  return files;
}

function runtimeImports(file, content) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const modules = new Set();
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const onlyTypes = clause?.isTypeOnly || (clause && !clause.name && clause.namedBindings &&
        ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 &&
        clause.namedBindings.elements.every(element => element.isTypeOnly));
      if (!onlyTypes) modules.add(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const onlyTypes = node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every(element => element.isTypeOnly);
      if (!onlyTypes) modules.add(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      modules.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return modules;
}

const workspaces = [];
for (const group of ['backend', 'packages', 'frontend']) {
  for (const entry of await readdir(resolve(root, group), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = resolve(root, group, entry.name);
    let manifest;
    try { manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const dependencies = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {})
    ]);
    workspaces.push({ group, directory, name: manifest.name, dependencies });
  }
}

function owningWorkspace(file) { return workspaces.find(workspace => file.startsWith(`${workspace.directory}/`)); }
async function resolveSource(file, module) {
  const target = resolve(dirname(file), module);
  for (const candidate of [target, `${target}.ts`, `${target}.tsx`, `${target}.mts`, `${target}.cts`, resolve(target, 'index.ts'), resolve(target, 'index.tsx')]) {
    if (/\.(?:css|json|svg|png|webp|jpg|jpeg)$/.test(candidate)) continue;
    if (await stat(candidate).then(value => value.isFile()).catch(() => false)) return candidate;
  }
  return null;
}
function checkBareImport(workspace, file, module) {
  if (module.startsWith('/') || module.startsWith('node:') || builtins.has(module)) return;
  // Next's compiler owns these marker aliases; they are not runtime packages.
  if (workspace.dependencies.has('next') && ['server-only', 'client-only'].includes(module)) return;
  const dependency = module.startsWith('@') ? module.split('/').slice(0, 2).join('/') : module.split('/')[0];
  if (!workspace.dependencies.has(dependency)) missing.push(`${relative(root, file)} imports ${dependency}, missing from ${relative(root, workspace.directory)}/package.json production dependencies`);
}

for (const workspace of workspaces) {
  if (workspace.group !== 'frontend') {
    for (const file of await sourceFiles(resolve(workspace.directory, 'src'))) {
      checked++;
      for (const module of runtimeImports(file, await readFile(file, 'utf8'))) {
        if (!module.startsWith('.')) checkBareImport(workspace, file, module);
      }
    }
    continue;
  }
  // Shared frontend files have no manifest. Their runtime imports belong to
  // each app that reaches them. Crossing into a packaged workspace is a real
  // dependency even when source code uses a relative filesystem path.
  const visited = new Set();
  async function visit(file) {
    if (visited.has(file)) return;
    visited.add(file); checked++;
    for (const module of runtimeImports(file, await readFile(file, 'utf8'))) {
      if (!module.startsWith('.')) { checkBareImport(workspace, file, module); continue; }
      const target = await resolveSource(file, module); if (!target) continue;
      const owner = owningWorkspace(target);
      if (owner && owner.directory !== workspace.directory) {
        if (!workspace.dependencies.has(owner.name)) missing.push(`${relative(root, file)} imports ${relative(root, target)}, missing ${owner.name} from ${relative(root, workspace.directory)}/package.json production dependencies`);
      } else if (target.startsWith(`${root}/frontend/`)) await visit(target);
    }
  }
  for (const file of await sourceFiles(workspace.directory)) await visit(file);
}

if (missing.length) {
  console.error(missing.join('\n'));
  process.exitCode = 1;
} else console.log(`Runtime dependency declarations verified for ${checked} backend, package and frontend source files, including shared frontend imports.`);
