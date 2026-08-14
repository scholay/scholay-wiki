#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const projectRoot = process.cwd();
const outputDir = resolve(projectRoot, 'build');
const manifestPath = resolve(outputDir, '.vite/manifest.json');
const budgetPath = resolve(projectRoot, 'bundle-budgets.json');
const shouldCheck = process.argv.includes('--check');

if (!existsSync(manifestPath)) {
  console.error(`Bundle manifest not found: ${manifestPath}`);
  console.error('Run `npm run build -- --manifest` first.');
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const budgets = JSON.parse(readFileSync(budgetPath, 'utf8'));
const manifestEntries = Object.entries(manifest);
const entryKeys = manifestEntries.filter(([, chunk]) => chunk.isEntry).map(([key]) => key);

if (entryKeys.length === 0) {
  console.error('No entry chunk was found in the Vite manifest.');
  process.exit(2);
}

function collectStaticClosure(rootKeys) {
  const keys = new Set();
  const files = new Set();

  function visit(key) {
    if (keys.has(key)) return;
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Manifest chunk not found: ${key}`);
    keys.add(key);
    if (chunk.file) files.add(chunk.file);
    for (const cssFile of chunk.css ?? []) files.add(cssFile);
    for (const importedKey of chunk.imports ?? []) visit(importedKey);
  }

  for (const rootKey of rootKeys) visit(rootKey);
  return { keys, files };
}

function manifestKeyForSource(source) {
  if (manifest[source]) return source;
  const matches = manifestEntries.filter(([, chunk]) => chunk.src === source);
  if (matches.length !== 1) {
    throw new Error(`Expected one manifest chunk for ${source}, found ${matches.length}`);
  }
  return matches[0][0];
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(dir, entry.name);
    return entry.isDirectory() ? listFiles(absolute) : [absolute];
  });
}

const sizeCache = new Map();
function fileSizes(relativePath) {
  if (sizeCache.has(relativePath)) return sizeCache.get(relativePath);
  const absolutePath = resolve(outputDir, relativePath);
  const contents = readFileSync(absolutePath);
  const sizes = { raw: contents.length, gzip: gzipSync(contents).length };
  sizeCache.set(relativePath, sizes);
  return sizes;
}

const sum = (files, field) =>
  files.reduce((total, file) => total + fileSizes(file)[field], 0);

function closureMetrics(closure) {
  const js = [...closure.files].filter((file) => extname(file) === '.js');
  const css = [...closure.files].filter((file) => extname(file) === '.css');
  return {
    jsGzipBytes: sum(js, 'gzip'),
    jsRawBytes: sum(js, 'raw'),
    cssGzipBytes: sum(css, 'gzip'),
    cssRawBytes: sum(css, 'raw'),
    jsRequestCount: js.length,
    requestCount: closure.files.size,
  };
}

const entryClosure = collectStaticClosure(entryKeys);
const entry = closureMetrics(entryClosure);
const routeClosures = Object.fromEntries(
  Object.entries(budgets.routeClosures ?? {}).map(([name, budget]) => {
    // Data Router 的首个 lazy route 在 entry 后立即加载；必须统计
    // entry + layout + page 的静态闭包，不能只看 manifest.isEntry。
    const sourceKeys = budget.sources.map(manifestKeyForSource);
    const closure = collectStaticClosure([...entryKeys, ...sourceKeys]);
    return [name, { ...closureMetrics(closure), keys: closure.keys }];
  }),
);

const allJs = listFiles(resolve(outputDir, 'assets')).filter((file) => extname(file) === '.js');
const allJsSizes = allJs.map((absolutePath) => {
  const contents = readFileSync(absolutePath);
  return {
    file: basename(absolutePath),
    raw: statSync(absolutePath).size,
    gzip: gzipSync(contents).length,
  };
});
const largestJs = [...allJsSizes].sort((a, b) => b.gzip - a.gzip)[0] ?? {
  file: '(none)',
  raw: 0,
  gzip: 0,
};
const rumKeys = manifestEntries
  .filter(([key, chunk]) => key.includes('web-vitals') || chunk.src?.includes('web-vitals'))
  .map(([key]) => key);
const webVitalsInCriticalClosure = [entryClosure.keys, ...Object.values(routeClosures).map((route) => route.keys)]
  .some((keys) => rumKeys.some((key) => keys.has(key)));

const metrics = {
  entryJsGzipBytes: entry.jsGzipBytes,
  entryJsRawBytes: entry.jsRawBytes,
  entryCssGzipBytes: entry.cssGzipBytes,
  entryCssRawBytes: entry.cssRawBytes,
  entryRequestCount: entry.requestCount,
  largestJsChunkGzipBytes: largestJs.gzip,
  largestJsChunkRawBytes: largestJs.raw,
  totalJsGzipBytes: allJsSizes.reduce((total, item) => total + item.gzip, 0),
  jsChunkCount: allJsSizes.length,
  tinyJsChunkCount: allJsSizes.filter((item) => item.raw < 2_048).length,
  webVitalsInCriticalClosure,
};

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
console.log('Bundle budget report (gzip is transfer size):');
console.table({
  'Entry bootstrap JS': { gzip: kib(entry.jsGzipBytes), raw: kib(entry.jsRawBytes) },
  'Entry bootstrap CSS': { gzip: kib(entry.cssGzipBytes), raw: kib(entry.cssRawBytes) },
  'Largest JS chunk': { gzip: kib(largestJs.gzip), raw: kib(largestJs.raw) },
  'All route JS': { gzip: kib(metrics.totalJsGzipBytes), raw: `${metrics.jsChunkCount} chunks` },
});
console.log(`Entry bootstrap requests: ${entry.requestCount}`);
console.log(`Largest JS chunk: ${largestJs.file}`);
console.log(`Tiny JS chunks (<2 KiB raw): ${metrics.tinyJsChunkCount}`);
console.log('\nCritical Data Router closures:');
console.table(
  Object.fromEntries(
    Object.entries(routeClosures).map(([name, route]) => [
      name,
      {
        'JS gzip': kib(route.jsGzipBytes),
        'JS requests': route.jsRequestCount,
        'JS + CSS requests': route.requestCount,
      },
    ]),
  ),
);
console.log(
  `Web Vitals in a critical closure: ${webVitalsInCriticalClosure ? 'YES' : 'no'}`,
);

if (shouldCheck) {
  const failures = [];
  for (const metricName of [
    'entryJsGzipBytes',
    'entryCssGzipBytes',
    'entryRequestCount',
    'largestJsChunkGzipBytes',
    'totalJsGzipBytes',
    'jsChunkCount',
    'tinyJsChunkCount',
  ]) {
    if (metrics[metricName] > budgets[metricName]) {
      failures.push(`${metricName}: ${metrics[metricName]} > ${budgets[metricName]}`);
    }
  }
  for (const [name, routeBudget] of Object.entries(budgets.routeClosures ?? {})) {
    const route = routeClosures[name];
    if (route.jsGzipBytes > routeBudget.maxJsGzipBytes) {
      failures.push(
        `${name}.jsGzipBytes: ${route.jsGzipBytes} > ${routeBudget.maxJsGzipBytes}`,
      );
    }
    if (route.jsRequestCount > routeBudget.maxJsRequestCount) {
      failures.push(
        `${name}.jsRequestCount: ${route.jsRequestCount} > ${routeBudget.maxJsRequestCount}`,
      );
    }
  }
  if (budgets.webVitalsMustBeAsync && webVitalsInCriticalClosure) {
    failures.push('webVitalsInCriticalClosure: expected false, got true');
  }
  if (failures.length > 0) {
    console.error('\nBundle budget failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('\nBundle budget passed.');
}
