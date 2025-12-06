const fs = require('fs');
const path = require('path');

const jsDirCandidates = [
  path.join(__dirname, '..', 'client', 'public', 'assets', 'js'),
  path.join(__dirname, '..', 'client', 'assets', 'js'),
];

const jsDir = jsDirCandidates.find((candidate) => fs.existsSync(candidate));

const apiRegex = /(['"`])(\/api\/[^'"`]+)\1/g;

function walkJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkJsFiles(fullPath);
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.js')) {
      return [fullPath];
    }
    return [];
  });
}

function extractApiRoutes(content) {
  const routes = new Set();
  let match;
  while ((match = apiRegex.exec(content)) !== null) {
    routes.add(match[2]);
  }
  return Array.from(routes);
}

function toPosixRelative(filePath) {
  return path.relative(jsDir, filePath).split(path.sep).join('/');
}

function buildMappings() {
  const jsToRoutes = {};
  const jsFiles = walkJsFiles(jsDir);

  jsFiles.forEach((filePath) => {
    const relPath = toPosixRelative(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const routes = extractApiRoutes(content);
    jsToRoutes[relPath] = routes;
  });

  const routesToJs = {};
  Object.entries(jsToRoutes).forEach(([file, routes]) => {
    routes.forEach((route) => {
      if (!routesToJs[route]) {
        routesToJs[route] = [];
      }
      routesToJs[route].push(file);
    });
  });

  return { jsToRoutes, routesToJs };
}

function printMapping({ jsToRoutes, routesToJs }) {
  const sortedFiles = Object.keys(jsToRoutes).sort();
  const sortedRoutes = Object.keys(routesToJs).sort();

  console.log('Mapping: JS files -> API routes\n');
  sortedFiles.forEach((file) => {
    console.log(file);
    const routes = jsToRoutes[file];
    if (!routes.length) {
      console.log('  (no /api/ calls found)');
    } else {
      routes.sort().forEach((route) => console.log(`  ${route}`));
    }
    console.log();
  });

  console.log('Mapping: API routes -> JS files\n');
  sortedRoutes.forEach((route) => {
    console.log(route);
    routesToJs[route].sort().forEach((file) => console.log(`  ${file}`));
    console.log();
  });
}

function printOptionalInsights({ jsToRoutes, routesToJs }) {
  const singleUseRoutes = Object.entries(routesToJs)
    .filter(([, files]) => files.length === 1)
    .map(([route, files]) => ({ route, files: files.slice().sort() }))
    .sort((a, b) => a.route.localeCompare(b.route));

  const filesWithNoApiCalls = Object.entries(jsToRoutes)
    .filter(([, routes]) => routes.length === 0)
    .map(([file]) => file)
    .sort();

  console.log('API routes used by a single JS file:\n');
  if (!singleUseRoutes.length) {
    console.log('  (none)');
  } else {
    singleUseRoutes.forEach(({ route, files }) => {
      console.log(`  ${route}`);
      files.forEach((file) => console.log(`    ${file}`));
    });
  }
  console.log();

  console.log('JS files with no /api/ calls:\n');
  if (!filesWithNoApiCalls.length) {
    console.log('  (none)');
  } else {
    filesWithNoApiCalls.forEach((file) => console.log(`  ${file}`));
  }
  console.log();
}

function main() {
  if (!jsDir) {
    console.error('JS directory not found. Checked:');
    jsDirCandidates.forEach((candidate) => console.error(`  ${candidate}`));
    process.exit(1);
  }

  const mappings = buildMappings();
  printMapping(mappings);
  printOptionalInsights(mappings);
}

main();
