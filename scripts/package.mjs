// Builds the Chrome Web Store upload from extension/.
//
// Writes the ZIP container directly rather than shelling out to a zip tool:
// PowerShell's Compress-Archive writes backslash path separators, which can make
// Chrome read shared/fees.js as a flat filename and break the content scripts.
// Entry names here always use forward slashes.
//
// Usage: npm run package

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'extension');

// Development-only files that must not ship to the store.
const EXCLUDED_DIRS = new Set(['tests']);
const EXCLUDED_FILES = new Set(['icon.svg']);

// Fixed DOS timestamp (1980-01-01) so repeated builds are byte-identical.
const DOS_TIME = 0;
const DOS_DATE = 33;

function collect(dir, prefix = '') {
  const found = [];

  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const relative = prefix ? `${prefix}/${name}` : name;

    if (statSync(full).isDirectory()) {
      if (!EXCLUDED_DIRS.has(name)) {
        found.push(...collect(full, relative));
      }
    } else if (!EXCLUDED_FILES.has(relative)) {
      found.push({ name: relative, full });
    }
  }

  return found;
}

function build(files) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const data = readFileSync(file.full);
    const deflated = deflateRawSync(data, { level: 9 });
    const store = deflated.length >= data.length;
    const body = store ? data : deflated;
    const method = store ? 0 : 8;
    const checksum = crc32(data);
    const name = Buffer.from(file.name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(DOS_TIME, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt16LE(0, 30);
    entry.writeUInt16LE(0, 32);
    entry.writeUInt16LE(0, 34);
    entry.writeUInt16LE(0, 36);
    entry.writeUInt32LE(0, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += local.length + name.length + body.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, directory, end]);
}

if (!existsSync(source)) {
  console.error(`No extension/ folder at ${source}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8'));
const files = collect(source);

for (const required of ['manifest.json', 'content.js', 'content.css']) {
  if (!files.some((file) => file.name === required)) {
    console.error(`Refusing to package: ${required} is missing`);
    process.exit(1);
  }
}

const dest = join(root, `macbid-true-price-${manifest.version}.zip`);
writeFileSync(dest, build(files));

console.log(`Packaged v${manifest.version} -> ${dest}`);
for (const file of files) {
  console.log(`  ${file.name}`);
}
