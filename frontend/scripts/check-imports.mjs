/**
 * 静态校验构建产物里的每一条 import 是否真的能落到文件上。
 * 目的：在没有浏览器的环境里提前发现 404（例如动态 import 路径没被改写）。
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appDir = path.join(root, 'dist', 'app');
const html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');

const mapMatch = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (!mapMatch) throw new Error('index.html 里没有 importmap');
const importMap = JSON.parse(mapMatch[1]).imports ?? {};

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

let broken = 0;
let checked = 0;

for (const file of walk(appDir).filter((f) => f.endsWith('.js'))) {
  const code = fs.readFileSync(file, 'utf8');
  const re = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
  let match;
  while ((match = re.exec(code))) {
    const spec = match[1];
    checked += 1;
    if (spec.startsWith('.')) {
      const target = path.resolve(path.dirname(file), spec);
      if (!fs.existsSync(target)) {
        broken += 1;
        console.log(`MISSING ${path.relative(root, file)} → ${spec}`);
      }
    } else if (!importMap[spec]) {
      broken += 1;
      console.log(`NO-MAP  ${path.relative(root, file)} → ${spec}`);
    }
  }
}

for (const [spec, url] of Object.entries(importMap)) {
  const target = path.join(root, 'dist', url.replace(/^\//, ''));
  if (!fs.existsSync(target)) {
    broken += 1;
    console.log(`MISSING vendor ${spec} → ${url}`);
  }
}

// 依赖包自身也不能有无法解析的裸导入（例如 vue-router 开发版会 import @vue/devtools-api）
for (const url of Object.values(importMap)) {
  const file = path.join(root, 'dist', url.replace(/^\//, ''));
  if (!fs.existsSync(file)) continue;
  const code = fs.readFileSync(file, 'utf8');
  const re = /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g;
  let match;
  const seen = new Set();
  while ((match = re.exec(code))) {
    const spec = match[1];
    if (spec.startsWith('.') || spec.startsWith('/') || seen.has(spec)) continue;
    seen.add(spec);
    if (!importMap[spec]) {
      broken += 1;
      console.log(`VENDOR  ${path.basename(file)} 里有未映射的裸导入 → ${spec}`);
    }
  }
}

console.log(`checked ${checked} imports, ${Object.keys(importMap).length} map entries, broken=${broken}`);
process.exit(broken ? 1 : 0);
