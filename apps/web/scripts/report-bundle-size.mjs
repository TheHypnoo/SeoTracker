import { gzipSync } from 'node:zlib';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const ASSETS_DIR = new URL('../.output/public/assets/', import.meta.url);
const MAX_ROWS = 15;
const CLIENT_ENTRY_LIMIT_BYTES = 500 * 1024;

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory.pathname, entry.name);
      return entry.isDirectory() ? listFiles(new URL(`${entry.name}/`, directory)) : path;
    }),
  );

  return files.flat();
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

const allFiles = await listFiles(ASSETS_DIR);
const assetRows = await Promise.all(
  allFiles
    .filter((file) => ['.css', '.js'].includes(extname(file)))
    .map(async (file) => {
      const contents = await readFile(file);
      const fileStat = await stat(file);

      return {
        file: relative(ASSETS_DIR.pathname, file),
        gzipBytes: gzipSync(contents).byteLength,
        sizeBytes: fileStat.size,
      };
    }),
);

const rows = assetRows.sort((left, right) => right.sizeBytes - left.sizeBytes);
const largestClientEntry = rows.find((row) => row.file.startsWith('index-'));

console.log('Largest client assets:');
for (const row of rows.slice(0, MAX_ROWS)) {
  console.log(
    `${row.file.padEnd(58)} ${formatBytes(row.sizeBytes).padStart(10)} gzip ${formatBytes(row.gzipBytes)}`,
  );
}

if (largestClientEntry && largestClientEntry.sizeBytes > CLIENT_ENTRY_LIMIT_BYTES) {
  console.warn(
    `\nWarning: client entry ${largestClientEntry.file} is ${formatBytes(
      largestClientEntry.sizeBytes,
    )}, above ${formatBytes(CLIENT_ENTRY_LIMIT_BYTES)}.`,
  );
}
