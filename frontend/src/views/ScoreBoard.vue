<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import { api, downloadUrl } from '../api.js';
import { initial } from '../utils.js';

const loading = ref(true);
const data = ref({ stats: {}, top10: [], insights: {}, ranking: [], feed: [] });
const chartType = ref('bar');
const sortMode = ref('score');

const chartEl = ref(null);
let chart = null;

const ranking = computed(() => {
  const rows = [...(data.value.ranking ?? [])];
  if (sortMode.value === 'calls') rows.sort((a, b) => b.calls - a.calls || b.total - a.total);
  return rows;
});

const maxScore = computed(() => Math.max(1, ...ranking.value.map((r) => r.total)));

function renderChart() {
  if (!chartEl.value) return;
  if (!chart) chart = echarts.init(chartEl.value);
  const top = data.value.top10 ?? [];
  const isBar = chartType.value === 'bar';
  chart.setOption(
    {
      grid: { left: 8, right: 12, top: 34, bottom: 6, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#16211b',
        borderWidth: 0,
        textStyle: { color: '#f3efe3', fontSize: 12 },
      },
      legend: {
        right: 0,
        top: 0,
        itemWidth: 9,
        itemHeight: 9,
        icon: 'circle',
        textStyle: { color: '#7d877e', fontSize: 11.5 },
      },
      xAxis: {
        type: 'category',
        data: top.map((s) => s.name),
        axisLine: { lineStyle: { color: '#e9e4d7' } },
        axisTick: { show: false },
        axisLabel: { color: '#7d877e', fontSize: 11.5 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#f1ede3' } },
        axisLabel: { color: '#9aa39b', fontSize: 11 },
      },
      series: [
        {
          name: '总积分',
          type: chartType.value,
          data: top.map((s) => s.total),
          smooth: true,
          barWidth: 18,
          itemStyle: { color: '#1f5c46', borderRadius: isBar ? [6, 6, 0, 0] : 0 },
          lineStyle: { width: 2.5, color: '#1f5c46' },
          symbolSize: 6,
          areaStyle: isBar ? undefined : { color: 'rgba(31,92,70,0.08)' },
        },
        {
          name: '随机点名次数',
          type: chartType.value,
          data: top.map((s) => s.randomCalls),
          smooth: true,
          barWidth: 18,
          itemStyle: { color: '#e5ab45', borderRadius: isBar ? [6, 6, 0, 0] : 0 },
          lineStyle: { width: 2, color: '#e5ab45' },
          symbolSize: 5,
        },
      ],
    },
    true,
  );
}

function onResize() {
  chart?.resize();
}

async function load() {
  data.value = await api.board();
  loading.value = false;
  await nextTick();
  renderChart();
}

watch(chartType, () => renderChart());

onMounted(async () => {
  await load();
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
        <h1 class="page-title">积分看板</h1>
        <p class="page-sub">实时统计本场点名覆盖率、积分排名与 Top 10 走势</p>
      </div>
      <div class="head-actions">
        <span class="pill">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 1.5" /></svg>
          本场数据实时刷新
        </span>
        <a class="btn" :href="downloadUrl('/export')">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 4v11" /><path d="m8 11 4 4 4-4" /><path d="M5 19h14" /></svg>
          导出积分详单
        </a>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi card">
        <div class="kpi-top"><span class="tiny muted">累计点名</span><span class="pill green">人次</span></div>
        <b>{{ data.stats.calls ?? 0 }}</b>
        <span class="tiny muted">随机 + 顺序两种模式合计</span>
      </div>
      <div class="kpi card">
        <div class="kpi-top"><span class="tiny muted">班级平均积分</span><span class="pill amber">分</span></div>
        <b>{{ data.stats.avgScore ?? 0 }}</b>
        <span class="tiny muted">初始 0 分 · 到场 +1 起</span>
      </div>
      <div class="kpi card">
        <div class="kpi-top"><span class="tiny muted">当前最高积分</span><span>👑</span></div>
        <b>{{ data.insights.leader?.total ?? 0 }}</b>
        <span class="tiny muted">{{ data.insights.leader?.name ?? '暂无数据' }} · 被抽中权重最低</span>
      </div>
      <div class="kpi card">
        <div class="kpi-top"><span class="tiny muted">名单覆盖率</span><span class="pill">{{ data.stats.calledStudents ?? 0 }}/{{ data.stats.students ?? 0 }}</span></div>
        <b>{{ data.stats.coverage ?? 0 }}%</b>
        <span class="tiny muted">至少被点到一次的比例</span>
      </div>
    </div>

    <section class="card chart-card">
      <div class="card-head">
        <h3 class="card-title">积分与活跃度趋势（Top 10）</h3>
        <span class="card-sub">按总积分取前 10 名 · 橙柱只统计随机点名</span>
        <div class="seg">
          <button :class="{ on: chartType === 'bar' }" @click="chartType = 'bar'">柱状图</button>
          <button :class="{ on: chartType === 'line' }" @click="chartType = 'line'">折线图</button>
        </div>
      </div>
      <div ref="chartEl" class="chart"></div>
      <div class="insights">
        <div class="insight">
          <span class="ic">👑</span>
          <div><span class="tiny muted">积分领跑</span><b>{{ data.insights.leader?.name ?? '—' }} · {{ data.insights.leader?.total ?? 0 }} 分</b></div>
        </div>
        <div class="insight">
          <span class="ic">🔄</span>
          <div><span class="tiny muted">随机点名最多</span><b>{{ data.insights.mostRandom?.name ?? '—' }} · {{ data.insights.mostRandom?.randomCalls ?? 0 }} 次</b></div>
        </div>
        <div class="insight">
          <span class="ic">🔔</span>
          <div><span class="tiny muted">尚未被点到</span><b>{{ data.insights.neverCalled ?? 0 }} 人{{ data.insights.neverNames?.length ? ` · ${data.insights.neverNames.join('、')}` : '' }}</b></div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h3 class="card-title">积分排行榜</h3>
        <span class="pill green">实时</span>
        <div class="head-right">
          <select v-model="sortMode" class="input small">
            <option value="score">按总积分排序</option>
            <option value="calls">按被点次数排序</option>
          </select>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th style="width: 64px">排名</th>
              <th>学生</th>
              <th>专业</th>
              <th style="width: 30%">总积分</th>
              <th style="text-align: right">随机点名</th>
              <th style="text-align: right">被点总次数</th>
              <th style="text-align: right">到场</th>
              <th style="text-align: center">徽章</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in ranking" :key="row.id">
              <td>
                <span class="rank" :class="row.rank <= 3 ? `top${row.rank}` : ''">
                  <template v-if="row.rank === 1">👑</template>
                  <template v-else>{{ row.rank }}</template>
                </span>
              </td>
              <td>
                <div class="who">
                  <span class="avatar">{{ initial(row.name) }}</span>
                  <div class="who-text"><b>{{ row.name }}</b><span class="tiny muted">{{ row.student_no }}</span></div>
                </div>
              </td>
              <td><span class="pill">{{ row.major || '未填' }}</span></td>
              <td>
                <div class="score-cell">
                  <b>{{ row.total }}</b>
                  <div class="meter"><i :style="{ width: `${(row.total / maxScore) * 100}%` }"></i></div>
                </div>
              </td>
              <td style="text-align: right" class="muted">{{ row.randomCalls }}</td>
              <td style="text-align: right" class="muted">{{ row.calls }}</td>
              <td style="text-align: right" class="muted">{{ row.presents }}</td>
              <td style="text-align: center">
                <span v-if="row.badges > 0" class="pill amber">🎖 {{ row.badges }}</span>
                <span v-else class="muted tiny">—</span>
              </td>
            </tr>
            <tr v-if="!ranking.length && !loading">
              <td colspan="8"><div class="empty">还没有数据，先去点名台抽几位同学</div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}

.kpi {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.kpi-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.kpi b {
  font-size: 28px;
  font-weight: 800;
  line-height: 1.2;
}

.chart-card {
  margin-bottom: 16px;
}

.seg {
  margin-left: auto;
  display: inline-flex;
  padding: 3px;
  border-radius: 9px;
  background: var(--paper);
  border: 1px solid var(--line);
}

.seg button {
  border: 0;
  background: transparent;
  padding: 5px 12px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
}

.seg button.on {
  background: #fff;
  color: var(--ink);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.chart {
  height: 300px;
  margin: 8px 14px 0;
}

.insights {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 14px 20px 18px;
  border-top: 1px solid var(--line-soft);
  margin-top: 6px;
}

.insight {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fbf9f3;
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  padding: 10px 12px;
}

.ic {
  font-size: 17px;
}

.insight div {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
  min-width: 0;
}

.insight b {
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.head-right {
  margin-left: auto;
}

.input.small {
  height: 32px;
  font-size: 12.5px;
  padding: 0 10px;
}

.table-wrap {
  overflow-x: auto;
}

.rank {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--paper-deep);
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 700;
}

.rank.top1 {
  background: #f6e6bd;
  color: #8a6114;
}

.rank.top2 {
  background: #e8e8e6;
  color: #5d605c;
}

.rank.top3 {
  background: #f0e0d2;
  color: #8a5a3a;
}

.who {
  display: flex;
  align-items: center;
  gap: 10px;
}

.who-text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.score-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.score-cell b {
  width: 34px;
  color: var(--green);
  font-variant-numeric: tabular-nums;
}

.score-cell .meter {
  flex: 1;
  max-width: 160px;
}

@media (max-width: 960px) {
  .kpis {
    grid-template-columns: 1fr 1fr;
  }
  .insights {
    grid-template-columns: 1fr;
  }
}
</style>
