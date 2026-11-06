<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../api.js';
import { pct } from '../utils.js';

const loading = ref(true);
const saving = ref(false);
const simulating = ref(false);
const toast = ref('');

const rules = reactive({
  reverseWeight: { enabled: true, decay: 0.85 },
  badge: { enabled: true, threshold: 3 },
  randomEvent: { enabled: true, probability: 0.25 },
  coldStart: { enabled: true, minCalls: 3, multiplier: 2.5 },
  combo: { enabled: true },
});

const meta = ref({ enabledCount: 5, tilt: '中等', eventFrequency: '', formula: '', badgeAvailable: 0, coldStartAffected: 0, totalStudents: 0 });
const sim = ref({ items: [], summary: null, draws: 3000 });

let toastTimer = null;

const EVENT_ITEMS = [
  { key: 'double', label: '双倍积分', desc: '本轮首次加减分按 ×2 结算，仅生效一次' },
  { key: 'shield', label: '课堂护盾', desc: '本轮第一次扣分被抵消为 0，仅生效一次' },
  { key: 'redpacket', label: '全班小红包', desc: '立即触发：全班同学各 +0.5 分' },
];

const enabledCount = computed(() => Object.values(rules).filter((r) => r.enabled).length);

/** 10 分同学相对 0 分同学的权重占比，用来解释「倾斜得多狠」 */
const highScoreRatio = computed(() => {
  const d = rules.reverseWeight.decay;
  return 1 / Math.pow(11, d);
});

const simMax = computed(() => Math.max(0.0001, ...sim.value.items.map((i) => i.simulated)));

function showToast(message) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 2400);
}

async function load() {
  const payload = await api.rules();
  Object.assign(rules, payload.rules);
  meta.value = payload.meta;
  loading.value = false;
  await runSimulation();
}

async function runSimulation() {
  simulating.value = true;
  try {
    const result = await api.simulate(3000);
    sim.value = result;
  } catch (error) {
    showToast(error.message);
  } finally {
    simulating.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    const result = await api.saveRules(rules);
    meta.value = result.meta;
    showToast('规则已保存并应用');
    await runSimulation();
  } catch (error) {
    showToast(error.message);
  } finally {
    saving.value = false;
  }
}

async function reset() {
  Object.assign(rules, {
    reverseWeight: { enabled: true, decay: 0.85 },
    badge: { enabled: true, threshold: 3 },
    randomEvent: { enabled: true, probability: 0.25 },
    coldStart: { enabled: true, minCalls: 3, multiplier: 2.5 },
    combo: { enabled: true },
  });
  await save();
}

const topStudent = computed(() => {
  const items = sim.value.items ?? [];
  return [...items].sort((a, b) => b.total - a.total)[0];
});

const averageSim = computed(() => (sim.value.items?.length ? 1 / 46 : 0));

onMounted(load);
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">趣味规则</h1>
        <p class="page-sub">反向权重、接力徽章、随机事件等玩法，保存后立即影响点名台抽签</p>
      </div>
      <div class="head-actions">
        <span v-if="toast" class="pill green">✓ {{ toast }}</span>
        <button class="btn btn-primary" :disabled="saving" @click="save">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M5 12.5 10 17.5 19 7" /></svg>
          {{ saving ? '保存中…' : '保存并应用' }}
        </button>
      </div>
    </div>

    <div class="statusbar">
      <span class="on">已启用 <b>{{ enabledCount }}</b> / 5 条规则</span>
      <i></i>
      <span>当前抽点倾斜：<b>{{ meta.tilt }}</b></span>
      <i></i>
      <span>随机事件：{{ rules.randomEvent.enabled ? `每 ${Math.max(1, Math.round(1 / rules.randomEvent.probability))} 次点名约触发 1 次` : '已关闭' }}</span>
      <span class="hint">修改后点击右侧「保存并应用」才会写入点名台</span>
    </div>

    <div class="grid">
      <div class="rules-col">
        <!-- 反向权重 -->
        <section class="card rule" :class="{ off: !rules.reverseWeight.enabled }">
          <div class="rule-head">
            <span class="rule-icon mint">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 19h16" /><path d="M7 19V9M12 19V5M17 19v-7" /></svg>
            </span>
            <div class="rule-title">
              <b>反向权重抽点</b>
              <span class="tiny muted">总积分越高，被随机点到的权重越低，让每个人都有机会被叫到</span>
            </div>
            <label class="switch"><input v-model="rules.reverseWeight.enabled" type="checkbox" /><i></i></label>
          </div>
          <div class="slider-row">
            <span class="tiny muted">积分衰减强度</span>
            <b>{{ rules.reverseWeight.decay.toFixed(2) }}</b>
            <input v-model.number="rules.reverseWeight.decay" type="range" min="0" max="1.5" step="0.05" />
            <div class="scale tiny muted"><span>接近平均</span><span>明显倾斜</span></div>
          </div>
          <p class="rule-note">10 分同学的抽中权重约为 0 分同学的 {{ (highScoreRatio * 100).toFixed(0) }}%</p>
        </section>

        <!-- 接力徽章 -->
        <section class="card rule" :class="{ off: !rules.badge.enabled }">
          <div class="rule-head">
            <span class="rule-icon amber">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3" /><path d="M12 13v5M9 21h6" /></svg>
            </span>
            <div class="rule-title">
              <b>接力徽章</b>
              <span class="tiny muted">累计被点到门槛次数获得一枚，可把本次作答题机会转交给另一位同学</span>
            </div>
            <label class="switch"><input v-model="rules.badge.enabled" type="checkbox" /><i></i></label>
          </div>
          <div class="stepper-row">
            <span class="tiny muted">获得徽章所需被点次数</span>
            <div class="stepper">
              <button @click="rules.badge.threshold = Math.max(1, rules.badge.threshold - 1)">−</button>
              <b>{{ rules.badge.threshold }}</b>
              <button @click="rules.badge.threshold = Math.min(20, rules.badge.threshold + 1)">+</button>
            </div>
            <span class="tiny muted">次</span>
          </div>
          <p class="rule-note">当前全班持有 {{ meta.badgeAvailable }} 枚可用接力徽章</p>
        </section>

        <!-- 随机事件 -->
        <section class="card rule" :class="{ off: !rules.randomEvent.enabled }">
          <div class="rule-head">
            <span class="rule-icon rose">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 8h9a4 4 0 0 1 0 8H6" /><path d="m9 5-3 3 3 3" /><path d="M18 16h-2" /></svg>
            </span>
            <div class="rule-title">
              <b>随机事件</b>
              <span class="tiny muted">每次点名后有一定概率触发一个课堂小事件，增加不确定性与趣味</span>
            </div>
            <label class="switch"><input v-model="rules.randomEvent.enabled" type="checkbox" /><i></i></label>
          </div>
          <div class="slider-row">
            <span class="tiny muted">事件触发概率</span>
            <b>{{ Math.round(rules.randomEvent.probability * 100) }}%</b>
            <input v-model.number="rules.randomEvent.probability" type="range" min="0" max="1" step="0.05" />
          </div>
          <div class="events">
            <div v-for="item in EVENT_ITEMS" :key="item.key" class="event">
              <b>{{ item.label }}</b>
              <span class="tiny muted">{{ item.desc }}</span>
            </div>
          </div>
        </section>

        <div class="row-2">
          <!-- 冷启动 -->
          <section class="card rule" :class="{ off: !rules.coldStart.enabled }">
            <div class="rule-head">
              <span class="rule-icon blue">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" /></svg>
              </span>
              <div class="rule-title">
                <b>冷启动加成</b>
                <span class="tiny muted">
                  {{ rules.coldStart.mode === 'lesson'
                    ? '本场还没被点到的同学权重放大，先把当堂没叫过的人补上'
                    : '累计被点次数不足的同学权重放大，避免成为「沉默的大多数」' }}
                </span>
              </div>
              <label class="switch"><input v-model="rules.coldStart.enabled" type="checkbox" /><i></i></label>
            </div>

            <div class="mode-tabs">
              <button :class="{ on: rules.coldStart.mode === 'total' }" @click="rules.coldStart.mode = 'total'">按累计次数</button>
              <button :class="{ on: rules.coldStart.mode === 'lesson' }" @click="rules.coldStart.mode = 'lesson'">按本场未点到</button>
            </div>

            <div class="dual">
              <label v-if="rules.coldStart.mode === 'total'" class="mini-field">
                <span class="tiny muted">静默阈值（累计被点少于）</span>
                <input v-model.number="rules.coldStart.minCalls" class="input" type="number" min="0" max="50" />
              </label>
              <label class="mini-field">
                <span class="tiny muted">权重倍数</span>
                <input v-model.number="rules.coldStart.multiplier" class="input" type="number" min="1" max="10" step="0.5" />
              </label>
            </div>
            <p v-if="rules.coldStart.mode === 'lesson'" class="rule-note">本场被点到 1 次即取消加成，下一节重新开始计算</p>
            <p class="rule-note">
              当前 <b>{{ meta.coldStartAffected }}</b> / {{ meta.totalStudents }} 人
              {{ rules.coldStart.mode === 'lesson' ? '本场还没被点到' : '处于冷启动区间' }}
              <template v-if="meta.totalStudents > 0 && meta.coldStartAffected >= meta.totalStudents">
                · 全员都符合条件，倍率会被归一化抵消，等于没有效果
              </template>
            </p>
          </section>

          <!-- 连击 -->
          <section class="card rule" :class="{ off: !rules.combo.enabled }">
            <div class="rule-head">
              <span class="rule-icon violet">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="m13 2-8 12h6l-1 8 8-12h-6z" /></svg>
              </span>
              <div class="rule-title">
                <b>连击奖励</b>
                <span class="tiny muted">同一同学连续两次「精准作答 +3」，额外 +1 分</span>
              </div>
              <label class="switch"><input v-model="rules.combo.enabled" type="checkbox" /><i></i></label>
            </div>
            <div class="combo-flow">
              <span class="pill green">精准作答 +3</span>
              <span class="muted">→</span>
              <span class="pill green">再次 +3</span>
              <span class="muted">→</span>
              <span class="pill amber">额外 +1</span>
            </div>
          </section>
        </div>

        <section class="card fixed-rule">
          <b class="tiny">基础积分规则（固定，不可关闭）</b>
          <p class="tiny muted">
            初始 0 分；每点到一次且到场 +1；准确复述问题 +0.5、未能复述 −1；准确回答问题按表现 +0.5 ~ 3。
            以上由「点名台」逐次录入，所有变动写入积分明细，可随时撤销。
          </p>
        </section>
      </div>

      <aside class="side-col">
        <section class="card">
          <div class="card-head">
            <h3 class="card-title">抽样概率模拟</h3>
            <button class="refresh" :disabled="simulating" @click="runSimulation" title="重新模拟">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v5h-5" /></svg>
            </button>
          </div>
          <div class="card-body">
            <p class="tiny muted sim-sub">按当前参数模拟 {{ sim.draws }} 次随机点名{{ simulating ? ' · 计算中…' : '' }}</p>
            <ul class="sim-list">
              <li v-for="item in sim.items.slice(0, 6)" :key="item.id">
                <div class="sim-head">
                  <b>{{ item.name }}</b>
                  <span class="tiny muted">{{ item.total }} 分</span>
                  <span class="sim-pct">{{ pct(item.simulated) }}</span>
                </div>
                <div class="meter"><i :style="{ width: `${(item.simulated / simMax) * 100}%` }"></i></div>
              </li>
            </ul>
            <p class="sim-note tiny muted">
              积分最高的 {{ topStudent?.name ?? '—' }}（{{ topStudent?.total ?? 0 }} 分）模拟抽中概率 {{ pct(topStudent?.simulated ?? 0) }}，
              班级平均 {{ pct(averageSim, 1) }}，低
              {{ ((averageSim - (topStudent?.simulated ?? 0)) * 100).toFixed(1) }} 个百分点。
            </p>
            <div class="legend tiny muted">
              <span><i class="dot red"></i>积分高于中位数</span>
              <span><i class="dot green"></i>积分低于中位数</span>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h3 class="card-title">规则总览</h3></div>
          <div class="card-body">
            <dl class="overview">
              <div><dt>启用规则</dt><dd>{{ enabledCount }} / 5 条</dd></div>
              <div><dt>冷启动口径</dt><dd>{{ rules.coldStart.mode === 'lesson' ? '本场未点到' : '累计次数' }}</dd></div>
              <div><dt>高分同学权重</dt><dd>约 {{ (highScoreRatio * 100).toFixed(0) }}% / 10 分</dd></div>
              <div><dt>随机事件期望</dt><dd>每 {{ Math.max(1, Math.round(1 / (rules.randomEvent.probability || 1))) }} 次 1 次</dd></div>
              <div><dt>接力徽章门槛</dt><dd>每 {{ rules.badge.threshold }} 次 1 枚</dd></div>
            </dl>
            <button class="btn btn-primary wide" :disabled="saving" @click="save">保存并应用</button>
            <button class="btn wide" :disabled="saving" @click="reset">恢复默认配置</button>
            <p class="tiny muted center">保存后立即影响点名台的随机权重、徽章与事件判定</p>
          </div>
        </section>
      </aside>
    </div>

    <transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped>
.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.statusbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 18px;
  border-radius: 14px;
  background: #fdfbf4;
  border: 1px solid var(--line);
  font-size: 12.5px;
  color: var(--ink-2);
  margin-bottom: 16px;
}

.statusbar b {
  color: var(--green);
}

.statusbar .on {
  font-weight: 600;
}

.statusbar i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #cfc9ba;
}

.statusbar .hint {
  margin-left: auto;
  color: var(--muted);
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 322px;
  gap: 16px;
  align-items: start;
}

.rules-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rule {
  padding: 18px 20px;
  transition: opacity 0.2s ease;
}

.rule.off {
  opacity: 0.62;
}

.rule-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.rule-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex: none;
}

.rule-icon.mint {
  background: var(--green-tint);
  color: var(--green);
}

.rule-icon.amber {
  background: var(--amber-tint);
  color: var(--amber-ink);
}

.rule-icon.rose {
  background: var(--red-tint);
  color: var(--red);
}

.rule-icon.blue {
  background: var(--blue-tint);
  color: var(--blue);
}

.rule-icon.violet {
  background: #eee9f7;
  color: #6b5a9e;
}

.rule-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.rule-title b {
  font-size: 14px;
}

.switch {
  position: relative;
  flex: none;
  cursor: pointer;
}

.switch input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.switch i {
  display: block;
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: #ddd6c6;
  position: relative;
  transition: background 0.18s ease;
}

.switch i::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  transition: transform 0.18s ease;
}

.switch input:checked + i {
  background: var(--green);
}

.switch input:checked + i::after {
  transform: translateX(18px);
}

.slider-row {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.slider-row b {
  font-size: 12.5px;
  color: var(--green);
  font-variant-numeric: tabular-nums;
}

.slider-row input[type='range'] {
  flex: 1;
  min-width: 140px;
  accent-color: var(--green);
}

.scale {
  display: flex;
  justify-content: space-between;
  width: 100%;
}

.rule-note {
  margin-top: 10px;
  font-size: 11.5px;
  color: var(--muted);
}

.stepper-row {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.stepper {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 2px;
}

.stepper button {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 7px;
  background: var(--paper);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.stepper b {
  width: 26px;
  text-align: center;
  font-size: 13px;
}

.events {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.event {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: #fbf9f3;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  padding: 9px 11px;
}

.event b {
  font-size: 12.5px;
}

.row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.dual {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.mode-tabs {
  display: inline-flex;
  margin-top: 12px;
  padding: 3px;
  border-radius: 9px;
  background: var(--paper);
  border: 1px solid var(--line);
}

.mode-tabs button {
  border: 0;
  background: transparent;
  padding: 5px 12px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
}

.mode-tabs button.on {
  background: #fff;
  color: var(--green);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.mini-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mini-field .input {
  height: 34px;
}

.combo-flow {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
}

.fixed-rule {
  padding: 14px 18px;
  background: #fbf9f3;
  border-style: dashed;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.side-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.refresh {
  margin-left: auto;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--muted);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.refresh:hover {
  color: var(--green);
}

.sim-sub {
  margin-bottom: 12px;
}

.sim-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sim-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 4px;
  font-size: 12.5px;
}

.sim-pct {
  margin-left: auto;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.sim-note {
  margin-top: 12px;
  padding: 10px;
  line-height: 1.65;
  background: #fbf9f3;
  border-radius: 10px;
}

.legend {
  display: flex;
  gap: 14px;
  margin-top: 10px;
}

.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}

.dot.red {
  background: var(--red);
}

.dot.green {
  background: var(--green);
}

.overview {
  margin: 0 0 14px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.overview div {
  display: flex;
  justify-content: space-between;
  font-size: 12.5px;
}

.overview dt {
  color: var(--muted);
}

.overview dd {
  margin: 0;
  font-weight: 600;
}

.wide {
  width: 100%;
  margin-bottom: 8px;
}

.center {
  text-align: center;
  margin-top: 4px;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 40px;
  transform: translateX(-50%);
  background: rgba(20, 28, 23, 0.9);
  color: #f6f2e6;
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 13px;
  z-index: 80;
}

@media (max-width: 1080px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .row-2 {
    grid-template-columns: 1fr;
  }
  .events {
    grid-template-columns: 1fr;
  }
}
</style>
