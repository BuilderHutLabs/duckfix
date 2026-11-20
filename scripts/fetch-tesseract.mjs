// Populates public/tesseract (worker + wasm cores) and public/tessdata (traineddata).
// Runs as npm `postinstall` and in CI. Existing files are skipped.
// Set WDUCK_SKIP_FETCH=1 to skip entirely.
import { copyFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const coreOut = join(root, 'public', 'tesseract');
const dataOut = join(root, 'public', 'tessdata');

const RAW = 'https://raw.githubusercontent.com/tesseract-ocr';
// osd must come from the legacy repo (tessdata): tessdata_fast has no legacy OSD data.
const TRAINEDDATA = [
  ['osd', `${RAW}/tessdata/main/osd.traineddata`],
  ['pol', `${RAW}/tessdata_fast/main/pol.traineddata`],
  ['eng', `${RAW}/tessdata_fast/main/eng.traineddata`],
  // searchable text in German / Spanish: served, but not precached (downloaded on first use)
  ['deu', `${RAW}/tessdata_fast/main/deu.traineddata`],
  ['spa', `${RAW}/tessdata_fast/main/spa.traineddata`],
];

// The browser worker loads the self-contained *.wasm.js variants (LSTM / legacy, SIMD / plain).
const CORE_FILES = [
  'tesseract-core.wasm.js',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
];

async function copyIfMissing(src, dest) {
  if (existsSync(dest)) return;
  if (!existsSync(src)) throw new Error(`missing source ${src} (run npm install first)`);
  await copyFile(src, dest);
  console.log(`copied ${dest}`);
}

async function download(url, dest) {
  if (existsSync(dest)) return;
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = `${dest}.part`;
  await writeFile(tmp, buf);
  await rename(tmp, dest);
}

async function main() {
  if (process.env.WDUCK_SKIP_FETCH) return;
  await mkdir(coreOut, { recursive: true });
  await mkdir(dataOut, { recursive: true });
  await copyIfMissing(join(nm, 'tesseract.js', 'dist', 'worker.min.js'), join(coreOut, 'worker.min.js'));
  for (const f of CORE_FILES) await copyIfMissing(join(nm, 'tesseract.js-core', f), join(coreOut, f));
  for (const [lang, url] of TRAINEDDATA) await download(url, join(dataOut, `${lang}.traineddata`));
}

main().catch((e) => {
  console.error(`fetch-tesseract failed: ${e.message}`);
  process.exit(1);
});
