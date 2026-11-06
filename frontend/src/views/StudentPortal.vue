<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import * as echarts from 'echarts';
import { api } from '../api.js';
import { fmtTime, fmtDelta, initial } from '../utils.js';

const keyword = ref('');
const loading = ref(false);
const error = ref('');
const data = ref(null);
const quick = ref([]);
const searchEl = ref(null);
const trendEl = ref(null);

let chart = null;

const profile = computed(() => data.value?.profile ?? null);

function renderTrend() {
  if (!trendEl.value || !data.value) return;
  if (!chart) chart = echarts.init(trendEl.value);
  const points = data.value.trend ?? [];
  chart.setOption(
    {
      grid: { left: 6, right: 10, top: 14, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#16211b',
        borderWidth: 0,
        textStyle: { color: '#f3efe3', fontSize: 12 },
        formatter: (params) => {
          const p = params[0];
          return `${fmtTime(p.axisValue)} · ${p.data} 分`;
        },
      },
      xAxis: {
        type: 'category',
        data: points.map((p) => p.t),
        axisLine: { lineStyle: { color: '#e9e4d7' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#9aa39b',
          fontSize: 10.5,
          formatter: (value) => fmtTime(value),
          interval: Math.max(0, Math.floor(points.length / 5) - 1),
        },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#f1ede3' } },
        axisLabel: { color: '#9aa39b', fontSize: 10.5 },
      },
      series: [
        {
          type: 'line',
          data: points.map((p) => p.value),
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { width: 2.5, color: '#1f5c46' },
          itemStyle: { color: '#1f5c46' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(31,92,70,0.22)' },
              { offset: 1, color: 'rgba(31,92,70,0.02)' },
            ]),
          },
        },
      ],
    },
    true,
  );
}

async function search(value) {
  const q = String(value ?? keyword.value).trim();
  if (!q) {
    error.value = '请输入学号或姓名';
    return;
  }
  keyword.value = q;
  loading.value = true;
  error.value = '';
  try {
    data.value = await api.portal(q);
    await nextTick();
    renderTrend();
  } catch (err) {
    data.value = null;
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function onResize() {
  chart?.resize();
}

onMounted(async () => {
  const roster = await api.students({ sort: 'no' });
  quick.value = roster.students.slice(0, 5).map((s) => ({ name: s.name, student_no: s.student_no }));
  if (quick.value.length) await search(quick.value[0].student_no);
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <span class="eyebrow">STUDENT PORTAL / 学生端</span>
        <h1 class="page-title">我的课堂积分</h1>
        <p class="page-sub">输入学号或姓名即可查询积分、排名与每一次加减分明细（只读）</p>
      </div>
      <span class="pill"><i class="dot"></i>数据实时来自教师端点名记录</span>
    </div>

    <section class="card search-card">
      <div class="search-row">
        <div class="search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
          <input
            ref="searchEl"
            v-model="keyword"
            placeholder="输入学号或姓名，例如 20240116"
            @keyup.enter="search()"
          />
        </div>
        <button class="btn btn-primary" :disabled="loading" @click="search()">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6" /><path d="m15.5 15.5 4 4" /></svg>
          {{ loading ? '查询中…' : '查询积分' }}
        </button>
      </div>
      <div class="quick">
        <span class="tiny muted">快速查询：</span>
        <button v-for="item in quick" :key="item.student_no" class="chip" @click="search(item.student_no)">
          {{ item.name }} <span class="tiny">{{ item.student_no.slice(-4) }}</span>
        </button>
      </div>
      <p v-if="error" class="error tiny">{{ error }}</p>
    </section>

    <div v-if="data" class="layout">
      <div class="left">
        <section class="id-card">
          <div class="id-top">
            <span class="id-label">STUDENT PROFILE</span>
            <span class="id-tag">只读</span>
          </div>
          <div class="id-main">
            <span class="id-avatar">{{ initial(profile.name) }}</span>
            <div>
              <b class="id-name">{{ profile.name }}</b>
              <p class="id-sub">学号 {{ profile.student_no }}</p>
              <p class="id-sub">{{ profile.major || '专业未填' }}</p>
            </div>
          </div>
          <div class="id-stats">
            <div>
              <span class="id-label">TOTAL POINTS</span>
              <b class="id-total">{{ profile.total }}</b>
            </div>
            <div class="id-rank">
              <span class="id-label">CLASS RANK</span>
              <b>#{{ profile.rank }} <em>/ {{ profile.rankTotal }}</em></b>
            </div>
          </div>
          <div class="id-chips">
            <span class="id-chip">🎖 接力徽章 {{ profile.badges }}</span>
            <span class="id-chip">被点 {{ profile.calls }} 次</span>
            <span class="id-chip">到场 {{ profile.presents }} 次</span>
          </div>
          <p class="id-foot">
            积分越高，被随机点到的概率越低；接力徽章可在被点时把答题机会转交给其他同学。
          </p>
        </section>

        <section class="card">
          <div class="card-head">
            <h3 class="card-title">个人积分走势</h3>
            <span class="pill green right">累计 {{ profile.total }} 分</span>
          </div>
          <div ref="trendEl" class="trend"></div>
        </section>
      </div>

      <div class="right">
        <div class="kpis">
          <div class="kpi card">
            <span class="tiny muted">随机被点</span>
            <b>{{ profile.randomCalls }}</b>
            <span class="tiny muted">次</span>
          </div>
          <div class="kpi card">
            <span class="tiny muted">顺序被点</span>
            <b>{{ profile.sequenceCalls }}</b>
            <span class="tiny muted">次</span>
          </div>
          <div class="kpi card">
            <span class="tiny muted">到场记录</span>
            <b>{{ profile.presents }}</b>
            <span class="tiny muted">次</span>
          </div>
          <div class="kpi card">
            <span class="tiny muted">超越同学</span>
            <b>{{ data.beatPercent }}%</b>
            <span class="tiny muted">班内</span>
          </div>
        </div>

        <section class="card">
          <div class="card-head">
            <h3 class="card-title">班级排名</h3>
            <span class="card-sub right">距离第 {{ Math.max(1, profile.rank - 1) }} 名还差 {{ Math.max(0, (data.ranking[0]?.total ?? 0) - profile.total) }} 分</span>
          </div>
          <div class="card-body">
            <ul class="rank-list">
              <li v-for="row in data.ranking" :key="row.rank" :class="{ me: row.isMe }">
                <span class="rank-no">{{ row.rank }}</span>
                <span class="rank-name">{{ row.name }}</span>
                <span v-if="row.isMe" class="pill green tiny">我</span>
                <span class="rank-score">{{ row.total }} 分</span>
              </li>
              <li v-if="!data.ranking.some((r) => r.isMe)" class="me">
                <span class="rank-no">{{ data.myRankRow.rank }}</span>
                <span class="rank-name">{{ data.myRankRow.name }}</span>
                <span class="pill green tiny">我</span>
                <span class="rank-score">{{ data.myRankRow.total }} 分</span>
              </li>
            </ul>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h3 class="card-title">积分明细</h3>
            <span class="card-sub right">仅显示最近 10 条</span>
          </div>
          <div class="card-body flush">
            <ul class="detail-list">
              <li v-for="item in data.details" :key="item.id">
                <span class="detail-icon" :class="item.delta >= 0 ? 'up' : 'down'">{{ item.delta >= 0 ? '+' : '−' }}</span>
                <div class="detail-main">
                  <b>{{ item.note || item.kind }}</b>
                  <span class="tiny muted">{{ fmtTime(item.created_at) }} · {{ item.mode === 'sequence' ? '顺序点名' : item.mode === 'transfer' ? '接力点名' : '随机点名' }}</span>
                </div>
                <span class="detail-delta" :class="item.delta >= 0 ? 'up' : 'down'">{{ fmtDelta(item.delta) }}</span>
              </li>
              <li v-if="!data.details.length" class="empty small">还没有积分记录</li>
            </ul>
          </div>
        </section>
      </div>
    </div>

    <div v-else-if="!loading" class="empty card empty-card">
      <p>输入学号或姓名查询你的课堂积分</p>
      <p class="tiny muted">例如：20240116 或 陆时雨</p>
    </div>

    <p class="foot-note tiny muted">
      学生端为只读视图，积分由教师在点名台录入；如对分数有疑问，请联系任课老师。
    </p>
  </div>
</template>

<style scoped>
.eyebrow {
  font-size: 10.5px;
  letter-spacing: 0.2em;
  color: var(--muted);
  font-weight: 600;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3f9a6d;
}

.search-card {
  padding: 18px 20px;
  margin-bottom: 16px;
}

.search-row {
  display: flex;
  gap: 10px;
}

.search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 9px;
  height: 44px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  color: var(--muted);
}

.search input {
  border: 0;
  outline: none;
  width: 100%;
  background: transparent;
  font-size: 14px;
}

.quick {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.chip {
  border: 1px solid var(--line);
  background: #fbf9f3;
  border-radius: 999px;
  padding: 4px 11px;
  font-size: 12px;
  color: var(--ink-2);
  cursor: pointer;
}

.chip:hover {
  border-color: #cfe0d4;
  color: var(--green);
}

.chip .tiny {
  color: var(--muted);
  margin-left: 3px;
}

.error {
  color: var(--red);
  margin-top: 8px;
}

.layout {
  display: grid;
  grid-template-columns: 348px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.left,
.right {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.id-card {
  border-radius: 20px;
  padding: 20px;
  color: #eef4ee;
  background:
    radial-gradient(420px 240px at 110% -10%, rgba(84, 160, 120, 0.3), transparent 65%),
    linear-gradient(150deg, #17271f, #101a15);
  box-shadow: 0 16px 34px rgba(16, 26, 21, 0.2);
}

.id-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.id-label {
  font-size: 9.5px;
  letter-spacing: 0.22em;
  color: rgba(238, 244, 238, 0.45);
}

.id-tag {
  font-size: 10.5px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(238, 244, 238, 0.25);
  color: rgba(238, 244, 238, 0.7);
}

.id-main {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}

.id-avatar {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: rgba(229, 171, 69, 0.16);
  border: 1px solid rgba(229, 171, 69, 0.3);
  color: #f0cd8b;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 17px;
  flex: none;
}

.id-name {
  font-size: 20px;
  letter-spacing: 0.02em;
}

.id-sub {
  font-size: 11.5px;
  color: rgba(238, 244, 238, 0.55);
  margin-top: 1px;
}

.id-stats {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.id-total {
  display: block;
  font-size: 38px;
  font-weight: 900;
  line-height: 1.1;
  color: #fdfbf3;
}

.id-rank b {
  font-size: 17px;
  color: #f0cd8b;
}

.id-rank em {
  font-style: normal;
  font-size: 12px;
  color: rgba(238, 244, 238, 0.5);
}

.id-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.id-chip {
  font-size: 11px;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(238, 244, 238, 0.75);
}

.id-foot {
  margin-top: 12px;
  font-size: 11px;
  line-height: 1.7;
  color: rgba(238, 244, 238, 0.45);
}

.trend {
  height: 190px;
  margin: 4px 12px 14px;
}

.right .kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.kpi {
  padding: 14px 16px;
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}

.kpi b {
  font-size: 24px;
  font-weight: 800;
  line-height: 1.1;
}

.kpi .tiny.muted:first-child {
  width: 100%;
}

.rank-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rank-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 13px;
}

.rank-list li.me {
  background: var(--green-tint);
}

.rank-no {
  width: 22px;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.rank-name {
  font-weight: 600;
}

.rank-score {
  margin-left: auto;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.card-body.flush {
  padding: 6px 0 8px;
}

.detail-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.detail-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
}

.detail-list li:hover {
  background: #fcfaf4;
}

.detail-icon {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 13px;
  flex: none;
}

.detail-icon.up {
  background: var(--green-tint);
  color: var(--green);
}

.detail-icon.down {
  background: var(--red-tint);
  color: var(--red);
}

.detail-main {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}

.detail-main b {
  font-size: 13px;
  font-weight: 600;
}

.detail-delta {
  margin-left: auto;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.detail-delta.up {
  color: var(--green);
}

.detail-delta.down {
  color: var(--red);
}

.empty-card {
  padding: 60px 20px;
}

.foot-note {
  margin-top: 16px;
  text-align: right;
}

@media (max-width: 1080px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .right .kpis {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
