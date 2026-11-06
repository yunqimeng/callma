<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const tabs = [
  { to: '/draw', label: '点名台' },
  { to: '/students', label: '学生名单' },
  { to: '/board', label: '积分看板' },
  { to: '/rules', label: '趣味规则' },
];

const isPortal = computed(() => route.path.startsWith('/portal'));
</script>

<template>
  <header class="shell">
    <div class="inner">
      <router-link to="/draw" class="brand">
        <span class="mark">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round">
            <circle cx="12" cy="12" r="8.2" />
            <path d="M12 7.6v4.7l3.1 1.9" />
          </svg>
        </span>
        <span class="brand-text">
          <b>点到</b>
          <i>CALME</i>
        </span>
      </router-link>

      <nav class="nav">
        <router-link v-for="tab in tabs" :key="tab.to" :to="tab.to" class="nav-item" :class="{ active: route.path === tab.to }">
          {{ tab.label }}
        </router-link>
      </nav>

      <div class="right">
        <router-link to="/portal" class="btn btn-sm" :class="{ 'btn-primary': isPortal }">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
            <circle cx="9" cy="8" r="3.2" />
            <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6S14 16 14.6 19" />
            <path d="M16 8.5h4M18 6.5v4" />
          </svg>
          学生端
        </router-link>
        <span class="teacher">
          <i class="dot"></i>
          李老师
        </span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.shell {
  position: sticky;
  top: 0;
  z-index: 30;
  background: rgba(247, 244, 236, 0.86);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}

.inner {
  max-width: 1280px;
  margin: 0 auto;
  height: 62px;
  padding: 0 28px;
  display: flex;
  align-items: center;
  gap: 26px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: none;
}

.mark {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--ink);
  color: #f6f1e3;
  display: grid;
  place-items: center;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.05;
}

.brand-text b {
  font-size: 15px;
  letter-spacing: 0.16em;
}

.brand-text i {
  font-style: normal;
  font-size: 9px;
  letter-spacing: 0.22em;
  color: var(--muted);
}

.nav {
  display: flex;
  align-items: center;
  gap: 2px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px;
}

.nav-item {
  padding: 6px 15px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
  transition: all 0.16s ease;
}

.nav-item:hover {
  background: var(--paper);
}

.nav-item.active {
  background: var(--ink);
  color: #fdfaf0;
}

.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}

.teacher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-2);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #3f9a6d;
  box-shadow: 0 0 0 3px rgba(63, 154, 109, 0.14);
}

@media (max-width: 860px) {
  .inner {
    padding: 0 14px;
    gap: 10px;
  }
  .nav-item {
    padding: 6px 9px;
    font-size: 12px;
  }
  .brand-text i,
  .teacher {
    display: none;
  }
}
</style>
