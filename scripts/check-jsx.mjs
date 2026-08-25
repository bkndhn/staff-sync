import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { transform } from 'esbuild';

const supportedExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const loaderByExtension = { '.js': 'js', '.jsx': 'jsx', '.ts': 'ts', '.tsx': 'tsx' };

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  }));
  return nested.flat();
}

const files = (await collectFiles('src')).filter(file => supportedExtensions.has(extname(file)));
const failures = [];

for (const file of files) {
  const extension = extname(file);
  try {
    await transform(await readFile(file, 'utf8'), {
      loader: loaderByExtension[extension],
      sourcefile: relative(process.cwd(), file),
      jsx: 'automatic',
    });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`JSX syntax check passed for ${files.length} source files.`);
}