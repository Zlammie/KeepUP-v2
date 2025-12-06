const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, '..', 'client', 'views');

const scriptTagRegex = /<script[^>]*\s+src=["']([^"']+)["'][^>]*>/gi;

function walkEjsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkEjsFiles(fullPath);
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.ejs')) {
      return [fullPath];
    }
    return [];
  });
}

function extractScripts(content) {
  const scripts = [];
  let match;
  while ((match = scriptTagRegex.exec(content)) !== null) {
    scripts.push(match[1]);
  }
  return scripts;
}

function toPosixRelative(filePath) {
  return path.relative(viewsDir, filePath).split(path.sep).join('/');
}

function buildMappings() {
  const pagesToScripts = {};
  const ejsFiles = walkEjsFiles(viewsDir);

  ejsFiles.forEach((filePath) => {
    const relPath = toPosixRelative(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const scripts = Array.from(new Set(extractScripts(content)));
    pagesToScripts[relPath] = scripts;
  });

  const scriptsToPages = {};
  Object.entries(pagesToScripts).forEach(([page, scripts]) => {
    scripts.forEach((scriptPath) => {
      if (!scriptsToPages[scriptPath]) {
        scriptsToPages[scriptPath] = [];
      }
      scriptsToPages[scriptPath].push(page);
    });
  });

  return { pagesToScripts, scriptsToPages };
}

function printMapping({ pagesToScripts, scriptsToPages }) {
  const sortedPages = Object.keys(pagesToScripts).sort();
  const sortedScripts = Object.keys(scriptsToPages).sort();

  console.log('Mapping: pages -> scripts\n');
  sortedPages.forEach((page) => {
    console.log(page);
    const scripts = pagesToScripts[page];
    if (!scripts.length) {
      console.log('  (no scripts found)');
    } else {
      scripts.forEach((scriptPath) => console.log(`  ${scriptPath}`));
    }
    console.log();
  });

  console.log('Mapping: scripts -> pages\n');
  sortedScripts.forEach((scriptPath) => {
    console.log(scriptPath);
    scriptsToPages[scriptPath].sort().forEach((page) => console.log(`  ${page}`));
    console.log();
  });
}

function printOptionalInsights({ pagesToScripts, scriptsToPages }) {
  const singleUseScripts = Object.entries(scriptsToPages)
    .filter(([, pages]) => pages.length === 1)
    .map(([script]) => script)
    .sort();

  const pagesWithContactDetailsScripts = Object.entries(pagesToScripts)
    .filter(([, scripts]) => scripts.some((src) => src.includes('/assets/js/pages/contact-details/')))
    .map(([page]) => page)
    .sort();

  console.log('Scripts used on a single page:\n');
  if (!singleUseScripts.length) {
    console.log('  (none)');
  } else {
    singleUseScripts.forEach((scriptPath) => console.log(`  ${scriptPath}`));
  }
  console.log();

  console.log('Pages loading /assets/js/pages/contact-details/* scripts:\n');
  if (!pagesWithContactDetailsScripts.length) {
    console.log('  (none)');
  } else {
    pagesWithContactDetailsScripts.forEach((page) => console.log(`  ${page}`));
  }
  console.log();
}

function main() {
  if (!fs.existsSync(viewsDir)) {
    console.error(`views directory not found at: ${viewsDir}`);
    process.exit(1);
  }

  const mappings = buildMappings();
  printMapping(mappings);
  printOptionalInsights(mappings);
}

main();
