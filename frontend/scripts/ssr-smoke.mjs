/**
 * SSR 冒烟测试：在 Node 里把每个页面渲染成 HTML 字符串，
 * 用来在没有浏览器的环境下捕捉模板编译错误、未定义变量、组件解析失败。
 * 不覆盖交互逻辑（onMounted 在 SSR 阶段不执行）。
 */
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createRouter, createMemoryHistory } from 'vue-router';

const pages = [
  ['DrawBoard', '../dist/app/views/DrawBoard.js'],
  ['Students', '../dist/app/views/Students.js'],
  ['ScoreBoard', '../dist/app/views/ScoreBoard.js'],
  ['Rules', '../dist/app/views/Rules.js'],
  ['StudentPortal', '../dist/app/views/StudentPortal.js'],
  ['TopNav', '../dist/app/components/TopNav.js'],
];

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { render: () => null } },
    { path: '/draw', component: { render: () => null } },
    { path: '/students', component: { render: () => null } },
    { path: '/board', component: { render: () => null } },
    { path: '/rules', component: { render: () => null } },
    { path: '/portal', component: { render: () => null } },
  ],
});

let failed = 0;

for (const [name, file] of pages) {
  try {
    const mod = await import(file);
    const app = createSSRApp({ render: () => h(mod.default) });
    app.use(router);
    const warnings = [];
    app.config.warnHandler = (msg) => warnings.push(msg);
    await router.push('/draw');
    await router.isReady();
    const html = await renderToString(app);
    const size = html.length;
    const ok = size > 200;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(14)} html=${size}B ${warnings.length ? '| warn: ' + warnings[0].slice(0, 90) : ''}`);
    if (!ok) failed += 1;
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name.padEnd(14)} ${error.message}`);
  }
}

process.exit(failed ? 1 : 0);
