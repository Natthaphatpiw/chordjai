import { readdir, readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Vercel builds each service's production dependency graph. Root dependencies
// can mask a missing declaration during local monorepo tests.
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
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.[cm]?tsx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) files.push(path);
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
      modules.add(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      modules.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return modules;
}

for (const group of ['backend', 'packages']) {
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
    for (const file of await sourceFiles(resolve(directory, 'src'))) {
      checked++;
      for (const module of runtimeImports(file, await readFile(file, 'utf8'))) {
        if (module.startsWith('.') || module.startsWith('/') || module.startsWith('node:') || builtins.has(module)) continue;
        const dependency = module.startsWith('@') ? module.split('/').slice(0, 2).join('/') : module.split('/')[0];
        if (!dependencies.has(dependency)) missing.push(`${relative(root, file)} imports ${dependency}, missing from ${relative(root, directory)}/package.json production dependencies`);
      }
    }
  }
}

if (missing.length) {
  console.error(missing.join('\n'));
  process.exitCode = 1;
} else console.log(`Runtime dependency declarations verified for ${checked} backend and package source files.`);
