import { readFile, rename, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';

const repositoryPath = 'metronome';
const outputDirectory = path.resolve('dist/client');
const prefixedDirectory = path.join(outputDirectory, repositoryPath);
const sourceAssetsDirectory = path.join(prefixedDirectory, '_next');
const targetAssetsDirectory = path.join(outputDirectory, '_next');

await rename(sourceAssetsDirectory, targetAssetsDirectory);
await rmdir(prefixedDirectory);

const html = await readFile(path.join(outputDirectory, 'index.html'), 'utf8');
const references: string[] = Array.from(html.matchAll(/(?:href|src)="([^"]+)"/g), (match) => match[1]);
const localReferences: string[] = references.filter((reference) => reference.startsWith(`/${repositoryPath}/`));

if (localReferences.length === 0) {
  throw new Error(`No /${repositoryPath}/ asset references were found in the generated index.html.`);
}

for (const reference of localReferences) {
  const relativePath = reference.slice(repositoryPath.length + 2);
  const file = await stat(path.join(outputDirectory, relativePath));

  if (!file.isFile()) {
    throw new Error(`Generated asset reference does not point to a file: ${reference}`);
  }
}
