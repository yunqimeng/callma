/**
 * 受限环境下的静态构建：直接用 @vue/compiler-sfc 编译单文件组件，
 * 产出原生 ES Module + 一段合并 CSS，浏览器用 importmap 加载 vue / vue-router / echarts。
 *
 * 用途：本机没有可用的 esbuild 子进程（沙箱限制 spawn），`npm run build`（Vite）
 * 在受限环境会失败；这个脚本不依赖任何子进程，产出可直接部署的 dist。
 *
 * 正常环境请优先使用 `npm run build`。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse, compileScript, compileStyle } from '@vue/compiler-sfc';

const root = process.cwd();
const srcDir = path.join(root, 'src');
const outDir = path.join(root, 'dist');
const appDir = path.join(outDir, 'app');
const vendorDir = path.join(outDir, 'vendor');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(appDir, { recursive: true });
fs.mkdirSync(vendorDir, { recursive: true });

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

const hash = (value) => crypto.createHash('md5').update(value).digest('hex').slice(0, 8);
const cssChunks = [];

function rewriteImports(code) {
  return code
    .replace(/(from\s+['"][^'"]+)\.vue(['"])/g, '$1.js$2')
    .replace(/(import\(\s*['"][^'"]+)\.vue(['"]\s*\))/g, '$1.js$2');
}

for (const file of walk(srcDir)) {
  const rel = path.relative(srcDir, file);
  const target = path.join(appDir, rel);

  if (file.endsWith('.css')) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file, target);
    continue;
  }

  if (file.endsWith('.js')) {
    let code = rewriteImports(fs.readFileSync(file, 'utf8'));
    // 浏览器不支持直接 import css，改为 index.html 里 link
    code = code.replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, code, 'utf8');
    continue;
  }

  if (!file.endsWith('.vue')) continue;

  const source = fs.readFileSync(file, 'utf8');
  const id = hash(rel);
  const { descriptor, errors } = parse(source, { filename: file });
  if (errors.length) throw new Error(`${rel}: ${errors[0].message}`);

  const compiled = compileScript(descriptor, {
    id,
    inlineTemplate: true,
    templateOptions: { compilerOptions: { scopeId: `data-v-${id}` } },
  });

  let code = rewriteImports(compiled.content).replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '');
  code = code.replace('export default ', 'const __sfc__ = ');
  code += `\n__sfc__.__scopeId = ${JSON.stringify(`data-v-${id}`)};\n__sfc__.__file = ${JSON.stringify(rel)};\nexport default __sfc__;\n`;

  const jsTarget = path.join(appDir, rel.replace(/\.vue$/, '.js'));
  fs.mkdirSync(path.dirname(jsTarget), { recursive: true });
  fs.writeFileSync(jsTarget, code, 'utf8');

  for (const style of descriptor.styles) {
    const result = compileStyle({
      source: style.content,
      filename: file,
      id,
      scoped: style.scoped,
    });
    if (result.errors.length) throw new Error(`${rel}: ${result.errors[0].message}`);
    cssChunks.push(result.code);
  }
}

fs.writeFileSync(path.join(appDir, 'app.css'), cssChunks.join('\n'), 'utf8');

// 依赖：直接引用各包自带的浏览器 ESM 产物
const vendor = [
  ['vue/dist/vue.runtime.esm-browser.prod.js', 'vue.js'],
  ['vue-router/dist/vue-router.esm-browser.prod.js', 'vue-router.js'],
  ['echarts/dist/echarts.esm.min.mjs', 'echarts.js'],
];
for (const [from, to] of vendor) {
  fs.copyFileSync(path.join(root, 'node_modules', from), path.join(vendorDir, to));
}

// index.html：换成 importmap + 预编译产物
const html = fs
  .readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(
    '<script type="module" src="/src/main.js"></script>',
    `<script type="importmap">
      {
        "imports": {
          "vue": "/vendor/vue.js",
          "vue-router": "/vendor/vue-router.js",
          "echarts": "/vendor/echarts.js"
        }
      }
    </script>
    <link rel="stylesheet" href="/app/styles/base.css" />
    <link rel="stylesheet" href="/app/app.css" />
    <script type="module" src="/app/main.js"></script>`,
  );
fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');

console.log(`static build done → ${outDir}`);
