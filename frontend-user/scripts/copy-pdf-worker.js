const fs = require('fs');
const path = require('path');

const pdfjsRoot = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist');
const workerSource = path.join(pdfjsRoot, 'build', 'pdf.worker.min.mjs');
const cmapsSource = path.join(pdfjsRoot, 'cmaps');
const standardFontsSource = path.join(pdfjsRoot, 'standard_fonts');

const publicDir = path.join(__dirname, '..', 'public');
const workerTarget = path.join(publicDir, 'pdf.worker.min.mjs');
const pdfAssetsDir = path.join(publicDir, 'pdfjs');
const cmapsTarget = path.join(pdfAssetsDir, 'cmaps');
const standardFontsTarget = path.join(pdfAssetsDir, 'standard_fonts');

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFileIfExists(source, target) {
  if (!fs.existsSync(source)) {
    console.warn('[copy-pdf-worker] Source not found:', source);
    return false;
  }

  ensureDirectory(path.dirname(target));
  fs.copyFileSync(source, target);
  return true;
}

function copyDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    console.warn('[copy-pdf-worker] Directory not found:', sourceDir);
    return false;
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  ensureDirectory(targetDir);

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  entries.forEach(entry => {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else {
      ensureDirectory(path.dirname(targetPath));
      fs.copyFileSync(sourcePath, targetPath);
    }
  });

  return true;
}

try {
  const workerCopied = copyFileIfExists(workerSource, workerTarget);
  if (workerCopied) {
    console.log('[copy-pdf-worker] Copied PDF worker to public directory');
  }

  const cmapsCopied = copyDirectory(cmapsSource, cmapsTarget);
  if (cmapsCopied) {
    console.log('[copy-pdf-worker] Copied PDF cmaps');
  }

  const fontsCopied = copyDirectory(standardFontsSource, standardFontsTarget);
  if (fontsCopied) {
    console.log('[copy-pdf-worker] Copied standard fonts');
  }
} catch (error) {
  console.error('[copy-pdf-worker] Failed to prepare PDF assets:', error);
  process.exitCode = 1;
}
