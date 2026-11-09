/**
 * EduShare - Automated Favicon Inserter (add-favicon.js)
 * Recursively scans all .html files and inserts the favicon <link> tag
 * before the closing </head> tag if not already present (idempotent).
 */

const fs = require('fs');
const path = require('path');

const FAVICON_TAG = '<link rel="icon" type="image/png" href="/image/Favicon.png">';
const FAVICON_REGEX = /rel=["'](?:shortcut\s+)?icon["']/i;
const HEAD_CLOSE_REGEX = /([ \t]*)(<\/head>)/i;

// Directories to ignore during recursive search
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.gemini',
  '.system_generated',
  'dist',
  'build'
]);

/**
 * Recursively retrieves all .html file paths starting from dir.
 */
function getAllHtmlFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        getAllHtmlFiles(fullPath, fileList);
      }
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

/**
 * Processes a single HTML file:
 * - Checks idempotency (skips if rel="icon" or rel="shortcut icon" exists)
 * - Inserts <link rel="icon" type="image/png" href="/image/Favicon.png"> before </head>
 */
function processHtmlFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Idempotency: skip if favicon link tag already exists
  if (FAVICON_REGEX.test(content)) {
    return { status: 'skipped', reason: 'Favicon link tag already present' };
  }

  // Check for </head> tag
  if (!HEAD_CLOSE_REGEX.test(content)) {
    return { status: 'skipped', reason: 'No </head> tag found' };
  }

  // Insert right before </head>, preserving indent
  const updatedContent = content.replace(HEAD_CLOSE_REGEX, (match, indent, closeTag) => {
    const tagIndent = indent || '  ';
    return `${tagIndent}${FAVICON_TAG}\n${indent}${closeTag}`;
  });

  fs.writeFileSync(filePath, updatedContent, 'utf8');
  return { status: 'updated' };
}

/**
 * Main execution runner.
 */
function run(rootDir = __dirname) {
  console.log(`Scanning for .html files in: ${rootDir}`);
  const htmlFiles = getAllHtmlFiles(rootDir);
  console.log(`Found ${htmlFiles.length} .html file(s).\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const file of htmlFiles) {
    const relativePath = path.relative(rootDir, file);
    const result = processHtmlFile(file);
    if (result.status === 'updated') {
      console.log(`[UPDATED] ${relativePath}`);
      updatedCount++;
    } else {
      console.log(`[SKIPPED] ${relativePath} (${result.reason})`);
      skippedCount++;
    }
  }

  console.log(`\nSummary: ${updatedCount} updated, ${skippedCount} skipped.`);
}

if (require.main === module) {
  run(path.resolve(__dirname));
}

module.exports = { run, processHtmlFile, getAllHtmlFiles };
