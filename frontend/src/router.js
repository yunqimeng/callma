import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/', redirect: '/draw' },
  { path: '/draw', name: 'draw', component: () => import('./views/DrawBoard.vue'), meta: { title: '点名台' } },
  { path: '/students', name: 'students', component: () => import('./views/Students.vue'), meta: { title: '学生名单' } },
  { path: '/board', name: 'board', component: () => import('./views/ScoreBoard.vue'), meta: { title: '积分看板' } },
  { path: '/rules', name: 'rules', component: () => import('./views/Rules.vue'), meta: { title: '趣味规则' } },
  { path: '/portal', name: 'portal', component: () => import('./views/StudentPortal.vue'), meta: { title: '学生端' } },
  { path: '/:pathMatch(.*)*', redirect: '/draw' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.afterEach((to) => {
  document.title = `${to.meta?.title ?? '点到'} · 点到 CALME`;
});

export default router;
