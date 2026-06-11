const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const markdownRoots = [
  'README.md',
  'CONTRIBUTING.md',
  'STATUS.md',
  'SECURITY.md',
  'docs/en',
  'docs/zh',
];

const stalePathPatterns = [
  /docs\/README\.md/g,
  /docs\/reference\/api-reference\.md/g,
  /docs\/api-reference\.md/g,
  /docs\/advanced\.md/g,
  /docs\/whitelist-ratelimit-independence\.md/g,
  /docs\/ip-whitelist-dynamic-config\.md/g,
];

function walkMarkdown(target) {
  const absolute = path.join(root, target);
  if (!fs.existsSync(absolute)) {
    return [];
  }

  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    return absolute.endsWith('.md') ? [absolute] : [];
  }

  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) {
      return walkMarkdown(path.relative(root, child));
    }
    return child.endsWith('.md') ? [child] : [];
  });
}

function normalizePath(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function slugBase(text) {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function headingText(line) {
  return line.replace(/^#{1,6}\s+/, '').replace(/\s+#+\s*$/, '').trim();
}

function buildAnchorSet(content) {
  const anchors = new Set();
  const counts = new Map();

  content.split(/\r?\n/).forEach((line) => {
    if (!/^#{1,6}\s+/.test(line)) {
      return;
    }

    const raw = headingText(line);
    const base = slugBase(raw);
    if (!base) {
      return;
    }

    const count = counts.get(base) || 0;
    counts.set(base, count + 1);
    const suffix = count === 0 ? '' : `-${count}`;
    anchors.add(`${base}${suffix}`);

    if (/^[^\p{L}\p{N}]/u.test(raw)) {
      anchors.add(`-${base}${suffix}`);
    }
  });

  return anchors;
}

function isExternal(href) {
  return /^(?:https?:)?\/\//.test(href)
    || href.startsWith('mailto:')
    || href.startsWith('tel:');
}

function validateMarkdownLink(file, content, match, errors) {
  const href = match[1].trim();
  if (!href || isExternal(href)) {
    return;
  }

  if (href.startsWith('#')) {
    const anchor = decodeURIComponent(href.slice(1)).toLowerCase();
    if (!buildAnchorSet(content).has(anchor)) {
      errors.push(`${normalizePath(file)}: missing anchor ${href}`);
    }
    return;
  }

  const [rawTarget, rawAnchor] = href.split('#');
  const target = path.resolve(path.dirname(file), decodeURIComponent(rawTarget));
  if (!fs.existsSync(target)) {
    errors.push(`${normalizePath(file)}: missing link target ${href}`);
    return;
  }

  if (rawAnchor && target.endsWith('.md')) {
    const targetContent = fs.readFileSync(target, 'utf8');
    const anchor = decodeURIComponent(rawAnchor).toLowerCase();
    if (!buildAnchorSet(targetContent).has(anchor)) {
      errors.push(`${normalizePath(file)}: missing target anchor ${href}`);
    }
  }
}

function validateReadmePackageBoundary(file, content, errors) {
  if (normalizePath(file) !== 'README.md') {
    return;
  }

  const linkRegex = /\[[^\]]+\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const href = match[1].trim();
    if (/^(docs\/|examples\/)/.test(href)) {
      errors.push(`README.md: npm package README must not link to unpacked local path ${href}`);
    }
  }
}

function validateStalePaths(file, content, errors) {
  stalePathPatterns.forEach((pattern) => {
    const matches = content.match(pattern);
    if (matches) {
      errors.push(`${normalizePath(file)}: stale docs path ${matches[0]}`);
    }
  });
}

function main() {
  const files = markdownRoots.flatMap(walkMarkdown);
  const errors = [];

  files.forEach((file) => {
    const content = fs.readFileSync(file, 'utf8');
    const linkRegex = /\[[^\]]+\]\(([^)]+)\)/g;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      validateMarkdownLink(file, content, match, errors);
    }

    validateReadmePackageBoundary(file, content, errors);
    validateStalePaths(file, content, errors);
  });

  if (errors.length > 0) {
    console.error('Documentation validation failed:');
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log(`Documentation validation passed (${files.length} markdown files checked).`);
}

main();
