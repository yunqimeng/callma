<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { api, downloadUrl } from '../api.js';
import { fmtTime, fmtDelta, pct, initial, modeLabel } from '../utils.js';

const loading = ref(true);
const busy = ref(false);
const submitting = ref(false);
const mode = ref('random');

const ctx = reactive({ total: 0, preview: [], stats: {}, rules: {}, feed: [], meta: {} });
const students = ref([]);
const classes = ref([]);
const readScope = () => {
  try {
    return localStorage.getItem('callme.scope') ?? '';
  } catch {
    return '';
  }
};
const scope = ref(readScope());
const current = ref(null);
const rolling = ref('');
const scored = ref(null);
const toast = ref('');
const transferOpen = ref(false);
const transferTo = ref('');

const repeatChoice = ref(null);
const answerChoice = ref(null);

let rollTimer = null;
let toastTimer = null;

const ANSWERS = [0.5, 1, 1.5, 2, 3];

const displayName = computed(() => {
  if (rolling.value) return rolling.value;
  if (current.value) return current.value.student.name;
  return '准备就绪';
});

const displaySub = computed(() => {
  if (current.value && !rolling.value) {
    return `学号 ${current.value.student.student_no} · ${current.value.student.major || '专业未填'}`;
  }
  return '点击下方按钮开始点名';
});

const maxPreview = computed(() => Math.max(0.0001, ...ctx.preview.map((p) => p.probability)));

const isSequence = computed(() => mode.value === 'sequence');

const DB_LABEL = { mysql: '云端数据库 · MySQL', postgres: '云端数据库 · PostgreSQL', sqlite: '本地数据库 · SQLite' };
const dbLabel = computed(() => DB_LABEL[ctx.db] ?? '数据库已连接');

const enabledRules = computed(() => {
  const r = ctx.rules ?? {};
  return [
    { label: '反向权重抽点', on: r.reverseWeight?.enabled },
    { label: '接力徽章', on: r.badge?.enabled },
    { label: '随机事件', on: r.randomEvent?.enabled },
    { label: '冷启动加成', on: r.coldStart?.enabled },
    { label: '连击奖励', on: r.combo?.enabled },
  ];
});

const canTransfer = computed(() => (current.value?.student?.badges ?? 0) > 0 && !scored.value);

function showToast(message) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 2400);
}

function startRolling() {
  const pool = students.value.length ? students.value : [{ name: '…' }];
  stopRolling();
  rollTimer = setInterval(() => {
    rolling.value = pool[Math.floor(Math.random() * pool.length)].name;
  }, 70);
}

function stopRolling() {
  if (rollTimer) clearInterval(rollTimer);
  rollTimer = null;
  rolling.value = '';
}

async function refreshFeed() {
  const { items } = await api.feed(8);
  ctx.feed = items;
}

async function load() {
  const [context, roster, classList] = await Promise.all([
    api.context(scope.value),
    api.students({ sort: 'no', className: scope.value }),
    api.classes(),
  ]);
  Object.assign(ctx, context);
  students.value = roster.students;
  classes.value = classList.classes ?? [];
  loading.value = false;
}

watch(scope, async (value) => {
  try {
    localStorage.setItem('callme.scope', value);
  } catch {
    /* 隐私模式下不可写，忽略即可 */
  }
  await load();
});

async function startDraw() {
  if (busy.value) return;
  busy.value = true;
  scored.value = null;
  repeatChoice.value = null;
  answerChoice.value = null;
  startRolling();
  const startedAt = Date.now();
  try {
    const result = await api.draw(mode.value, scope.value);
    const remain = Math.max(0, 760 - (Date.now() - startedAt));
    if (remain) await new Promise((resolve) => setTimeout(resolve, remain));
    stopRolling();
    current.value = result;
    ctx.stats = result.stats;
    ctx.preview = result.preview;
    if (result.badgeEarned) showToast('🎖 触发接力徽章：本次点名可转给其他同学');
    if (result.rollCall.eventLabel) showToast(`⚡ 随机事件：${result.rollCall.eventLabel}`);
    await refreshFeed();
  } catch (error) {
    stopRolling();
    showToast(error.message);
  } finally {
    busy.value = false;
  }
}

async function submitScore() {
  if (!current.value || scored.value || submitting.value) return;
  if (repeatChoice.value === null && answerChoice.value === null) {
    showToast('先选择复述情况，或直接选回答质量');
    return;
  }
  submitting.value = true;
  try {
    const result = await api.score({
      rollCallId: current.value.rollCall.id,
      repeat: repeatChoice.value,
      answer: answerChoice.value,
    });
    scored.value = result;
    showToast(`已记分：${fmtDelta(result.events.reduce((acc, e) => acc + e.delta, 0))}`);
    await load();
    await refreshFeed();
  } catch (error) {
    showToast(error.message);
  } finally {
    submitting.value = false;
  }
}

async function undo() {
  try {
    const result = await api.undo();
    current.value = null;
    scored.value = null;
    repeatChoice.value = null;
    answerChoice.value = null;
    showToast(result.message ?? '已撤销');
    await load();
    await refreshFeed();
  } catch (error) {
    showToast(error.message);
  }
}

async function doTransfer() {
  if (!transferTo.value) return;
  try {
    const result = await api.transfer({ rollCallId: current.value.rollCall.id, toStudentId: Number(transferTo.value) });
    current.value = { ...current.value, student: result.student, rollCall: result.rollCall };
    ctx.stats = result.stats;
    transferOpen.value = false;
    transferTo.value = '';
    showToast(`已转给 ${result.student.name}`);
    await load();
    await refreshFeed();
  } catch (error) {
    showToast(error.message);
  }
}

onMounted(load);
onUnmounted(() => {
  stopRolling();
  clearTimeout(toastTimer);
});
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">课堂点名台</h1>
        <p class="page-sub">随机点名与按学号顺序两种模式，点到即自动记「到场 +1」</p>
      </div>
      <div class="head-actions">
        <span class="pill"><i class="live-dot"></i>{{ dbLabel }}</span>
        <a class="btn" :href="downloadUrl('/export')">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 4v11" /><path d="m8 11 4 4 4-4" /><path d="M5 19h14" /></svg>
          导出积分详单
        </a>
      </div>
    </div>

    <div class="layout">
      <div class="main-col">
        <!-- 点名主角卡 -->
        <section class="hero">
          <div class="hero-top">
            <div class="mode-switch">
              <button :class="{ on: mode === 'random' }" @click="mode = 'random'">随机点名</button>
              <button :class="{ on: mode === 'sequence' }" @click="mode = 'sequence'">按学号顺序</button>
            </div>
            <select v-if="classes.length" v-model="scope" class="scope-select" title="本次点名的范围">
              <option value="">全部班级（{{ classes.reduce((a, c) => a + c.count, 0) }} 人）</option>
              <option v-for="item in classes" :key="item.class_name" :value="item.class_name">
                {{ item.class_name }}班（{{ item.count }} 人）
              </option>
            </select>
            <span class="hero-note">{{ isSequence ? '按学号从小到大依次点名，点完自动回到第一位' : '积分越高，被抽中权重越低' }}</span>
          </div>

          <div class="hero-main">
            <div class="hero-left">
              <span class="eyebrow">CURRENT STUDENT</span>
              <div class="name" :class="{ rolling: !!rolling }">{{ displayName }}</div>
              <p class="sub">{{ displaySub }}</p>

              <div class="chips">
                <span class="chip">共 {{ ctx.total }} 名学生</span>
                <span class="chip">{{ isSequence ? '顺序模式 · 不参与加权' : '随机权重已倾斜' }}</span>
                <span v-if="current && !isSequence" class="chip amber">本次概率 {{ pct(current.rollCall.probability) }}</span>
              </div>

              <button class="btn btn-amber cta" :disabled="busy" @click="startDraw">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></svg>
                {{ busy ? '抽取中…' : isSequence ? (current ? '点下一位' : '开始顺序点名') : current ? '再点一次' : '开始随机点名' }}
              </button>
            </div>

            <div class="hero-card-face" :class="{ filled: !!current && !rolling }">
              <template v-if="current && !rolling">
                <span class="face-initial">{{ initial(current.student.name) }}</span>
                <span v-if="current.badgeEarned" class="face-badge">🎖</span>
              </template>
              <span v-else class="face-q">?</span>
            </div>
          </div>

          <div class="hero-foot">
            <span>本场已点 <b>{{ ctx.stats.calls ?? 0 }}</b> 人次</span>
            <i></i>
            <span>覆盖 <b>{{ ctx.stats.calledStudents ?? 0 }}</b> 名学生</span>
            <i></i>
            <span>平均 <b>{{ ctx.stats.avgScore ?? 0 }}</b> 分</span>
          </div>

          <div v-if="current?.rollCall?.eventLabel && !rolling" class="event-banner">
            ⚡ 本轮随机事件：{{ current.rollCall.eventLabel }}
          </div>
        </section>

        <!-- 本次记录 -->
        <section class="card">
          <div class="card-head">
            <h3 class="card-title">本次记录</h3>
            <span class="pill green">点到即 +1</span>
            <div class="head-right">
              <template v-if="scored">
                <span class="scored-total">本次累计 <b>{{ fmtDelta(scored.events.reduce((a, e) => a + e.delta, 0)) }}</b></span>
              </template>
              <button class="btn btn-sm btn-ghost" @click="undo">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
                撤销上一步
              </button>
            </div>
          </div>

          <div class="card-body">
            <template v-if="current">
              <div class="who">
                <span class="avatar">{{ initial(current.student.name) }}</span>
                <div>
                  <b>{{ current.student.name }}</b>
                  <span class="muted tiny"> · {{ current.student.student_no }} · {{ modeLabel(current.rollCall.mode) }}点到</span>
                </div>
                <button v-if="canTransfer" class="btn btn-sm transfer" @click="transferOpen = true">转给其他同学</button>
                <span v-else-if="current.student.badges > 0" class="pill amber">徽章 {{ current.student.badges }} 枚</span>
              </div>

              <div class="score-rows" :class="{ locked: !!scored }">
                <div class="score-row">
                  <div class="label">
                    <b>复述问题</b>
                    <span class="muted tiny">准确复述 +0.5，未能复述 −1</span>
                  </div>
                  <div class="opts">
                    <button :class="{ pick: repeatChoice === 'correct', good: true }" @click="repeatChoice = repeatChoice === 'correct' ? null : 'correct'">准确复述 <em>+0.5</em></button>
                    <button :class="{ pick: repeatChoice === 'wrong', bad: true }" @click="repeatChoice = repeatChoice === 'wrong' ? null : 'wrong'">未能复述 <em>−1</em></button>
                  </div>
                </div>

                <div class="score-row">
                  <div class="label">
                    <b>回答质量</b>
                    <span class="muted tiny">按表现给 0.5 ~ 3 分，可留空</span>
                  </div>
                  <div class="opts">
                    <button
                      v-for="value in ANSWERS"
                      :key="value"
                      :class="{ pick: answerChoice === value, good: true }"
                      @click="answerChoice = answerChoice === value ? null : value"
                    >
                      +{{ value }}
                    </button>
                  </div>
                </div>
              </div>

              <div class="submit-row">
                <p class="muted tiny">
                  {{ scored ? '本次已入账，如需修改请点右上角「撤销上一步」' : '复述 + 回答可同时选择，提交后一起入账' }}
                </p>
                <button class="btn btn-primary" :disabled="submitting || !!scored" @click="submitScore">
                  {{ scored ? '已记分' : submitting ? '提交中…' : '提交本次记分' }}
                </button>
              </div>

              <div v-if="scored" class="receipt">
                <span v-for="(e, i) in scored.events" :key="i" class="pill" :class="e.delta >= 0 ? 'green' : 'red'">
                  {{ e.note }} {{ fmtDelta(e.delta) }}
                </span>
                <span class="pill">当前总分 {{ scored.total }}</span>
              </div>
            </template>

            <div v-else class="empty small">
              还没有点名记录。点上面的「开始随机点名」，抽到的同学会自动记 +1 到场。
            </div>
          </div>
        </section>

        <!-- 最近点名 -->
        <section class="card">
          <div class="card-head">
            <h3 class="card-title">最近点名</h3>
            <span class="pill">共 {{ ctx.stats.calls ?? 0 }} 条</span>
            <router-link to="/board" class="head-link">查看积分看板 →</router-link>
          </div>
          <div class="card-body flush">
            <ul class="feed">
              <li v-for="item in ctx.feed" :key="item.id">
                <span class="time">{{ fmtTime(item.called_at) }}</span>
                <span class="mode" :class="item.mode">{{ modeLabel(item.mode) }}</span>
                <span class="feed-name">{{ item.name }}</span>
                <span v-if="item.event" class="tiny muted">· {{ item.event === 'double' ? '双倍' : item.event === 'shield' ? '护盾' : '红包' }}</span>
                <span class="delta" :class="item.delta >= 0 ? 'up' : 'down'">{{ fmtDelta(item.delta) }}</span>
              </li>
              <li v-if="!ctx.feed.length" class="empty small">本场还没有点名记录</li>
            </ul>
          </div>
        </section>
      </div>

      <aside class="side-col">
        <section class="card">
          <div class="card-head">
            <h3 class="card-title">权重透视</h3>
            <span class="card-sub right">{{ isSequence ? '顺序模式不使用权重' : '总积分越高，被抽中概率越低' }}</span>
          </div>
          <div class="card-body">
            <ul class="weights">
              <li v-for="item in ctx.preview" :key="item.id">
                <div class="w-head">
                  <b>{{ item.name }}</b>
                  <span class="tiny muted">{{ item.total }} 分</span>
                  <span class="w-pct">{{ pct(item.probability) }}</span>
                </div>
                <div class="meter"><i :style="{ width: `${(item.probability / maxPreview) * 100}%` }"></i></div>
              </li>
            </ul>
            <p class="formula">{{ ctx.meta.formula }}，冷启动 ×{{ ctx.rules.coldStart?.multiplier ?? 2.5 }}</p>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h3 class="card-title">本场数据</h3>
            <span class="pill red live">LIVE</span>
          </div>
          <div class="card-body">
            <div class="mini-stats">
              <div><span class="tiny muted">累计点名</span><b>{{ ctx.stats.calls ?? 0 }}</b></div>
              <div><span class="tiny muted">到场记录</span><b>{{ ctx.stats.presents ?? 0 }}</b></div>
              <div><span class="tiny muted">平均积分</span><b>{{ ctx.stats.avgScore ?? 0 }}</b></div>
              <div><span class="tiny muted">接力徽章</span><b>{{ ctx.stats.badges ?? 0 }}</b></div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h3 class="card-title">生效规则</h3>
            <router-link to="/rules" class="head-link">调整配置 →</router-link>
          </div>
          <div class="card-body">
            <ul class="rule-list">
              <li v-for="rule in enabledRules" :key="rule.label">
                <span>{{ rule.label }}</span>
                <span class="pill" :class="rule.on ? 'green' : ''">{{ rule.on ? '已开启' : '已关闭' }}</span>
              </li>
            </ul>
          </div>
        </section>

        <p class="side-note">
          名单与积分实时写入数据库（MySQL / SQLite 同构），刷新页面不会丢失；换设备访问同一网址即可看到同一份数据。
        </p>
      </aside>
    </div>

    <!-- 转交点名 -->
    <transition name="fade">
      <div v-if="transferOpen" class="modal-mask" @click.self="transferOpen = false">
        <div class="modal">
          <h3>把这次点名转给谁？</h3>
          <p class="muted tiny">将消耗 {{ current?.student?.name }} 的 1 枚接力徽章</p>
          <select v-model="transferTo" class="input">
            <option value="">选择同学…</option>
            <option v-for="s in students.filter((s) => s.id !== current?.student?.id)" :key="s.id" :value="s.id">
              {{ s.name }} · {{ s.student_no }}
            </option>
          </select>
          <div class="modal-actions">
            <button class="btn" @click="transferOpen = false">取消</button>
            <button class="btn btn-primary" :disabled="!transferTo" @click="doTransfer">确认转交</button>
          </div>
        </div>
      </div>
    </transition>

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

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3f9a6d;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 336px;
  gap: 18px;
  align-items: start;
}

.main-col,
.side-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ---------- hero ---------- */
.hero {
  position: relative;
  overflow: hidden;
  border-radius: 22px;
  padding: 22px 24px 18px;
  color: #eef4ee;
  background:
    radial-gradient(700px 300px at 88% -20%, rgba(84, 160, 120, 0.28), transparent 70%),
    linear-gradient(135deg, #17271f 0%, #101a15 100%);
  box-shadow: 0 18px 40px rgba(16, 26, 21, 0.22);
}

.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 46px 46px;
  mask-image: radial-gradient(600px 320px at 30% 10%, #000 20%, transparent 80%);
  pointer-events: none;
}

.hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  position: relative;
}

.mode-switch {
  display: inline-flex;
  padding: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
}

.mode-switch button {
  border: 0;
  background: transparent;
  color: rgba(238, 244, 238, 0.72);
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.16s ease;
}

.mode-switch button.on {
  background: #f4f0e4;
  color: #17271f;
}

.scope-select {
  margin-left: 10px;
  height: 30px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #eef4ee;
  font-size: 12px;
  outline: none;
  cursor: pointer;
  max-width: 220px;
}

.scope-select option {
  color: #16211b;
}

.hero-note {
  font-size: 11.5px;
  color: rgba(238, 244, 238, 0.55);
}

.hero-main {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 0 16px;
}

.eyebrow {
  font-size: 10.5px;
  letter-spacing: 0.24em;
  color: rgba(238, 244, 238, 0.45);
}

.name {
  font-size: 46px;
  font-weight: 900;
  letter-spacing: 0.03em;
  line-height: 1.15;
  margin-top: 2px;
  color: #fdfbf3;
}

.name.rolling {
  opacity: 0.75;
  transform: translateY(1px);
}

.sub {
  margin-top: 4px;
  font-size: 13px;
  color: rgba(238, 244, 238, 0.62);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.chip {
  font-size: 11.5px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(238, 244, 238, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.chip.amber {
  background: rgba(229, 171, 69, 0.16);
  color: #f0c878;
  border-color: rgba(229, 171, 69, 0.3);
}

.cta {
  margin-top: 18px;
  height: 42px;
  padding: 0 20px;
  font-size: 14px;
}

.hero-card-face {
  width: 132px;
  height: 132px;
  flex: none;
  border-radius: 26px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  position: relative;
}

.hero-card-face.filled {
  background: linear-gradient(160deg, rgba(229, 171, 69, 0.22), rgba(229, 171, 69, 0.06));
  border-color: rgba(229, 171, 69, 0.32);
}

.face-q {
  font-size: 46px;
  font-weight: 300;
  color: rgba(238, 244, 238, 0.35);
}

.face-initial {
  font-size: 34px;
  font-weight: 800;
  color: #f4dca6;
  letter-spacing: 0.05em;
}

.face-badge {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 16px;
}

.hero-foot {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
  color: rgba(238, 244, 238, 0.55);
}

.hero-foot b {
  color: #eef4ee;
  font-size: 13px;
}

.hero-foot i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(238, 244, 238, 0.25);
}

.event-banner {
  position: relative;
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(229, 171, 69, 0.12);
  border: 1px solid rgba(229, 171, 69, 0.28);
  color: #f0c878;
  font-size: 12.5px;
}

/* ---------- 本次记录 ---------- */
.head-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}

.scored-total {
  font-size: 12px;
  color: var(--muted);
}

.scored-total b {
  color: var(--green);
  font-size: 15px;
  margin-left: 4px;
}

.who {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--line);
}

.transfer {
  margin-left: auto;
  border-color: #e6cf9b;
  color: var(--amber-ink);
  background: #fdf6e6;
}

.score-rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 14px;
}

.score-rows.locked .opts button {
  opacity: 0.55;
  pointer-events: none;
}

.score-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.label {
  min-width: 128px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.label b {
  font-size: 13px;
}

.opts {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.opts button {
  height: 34px;
  padding: 0 13px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: #fff;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-2);
  cursor: pointer;
  transition: all 0.14s ease;
}

.opts button em {
  font-style: normal;
  margin-left: 4px;
  color: var(--muted);
}

.opts button:hover {
  border-color: #d8d1bf;
  background: #fbf8f1;
}

.opts button.pick.good {
  background: var(--green-tint);
  border-color: #b7d3c4;
  color: var(--green);
}

.opts button.pick.good em {
  color: var(--green);
}

.opts button.pick.bad {
  background: var(--red-tint);
  border-color: #e3bdb5;
  color: var(--red);
}

.submit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--line);
}

.receipt {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

/* ---------- 最近点名 ---------- */
.head-link {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
  font-weight: 600;
}

.head-link:hover {
  color: var(--green);
}

.card-body.flush {
  padding: 8px 0 6px;
}

.feed {
  list-style: none;
  margin: 0;
  padding: 0;
}

.feed li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 20px;
  font-size: 13px;
}

.feed li:hover {
  background: #fcfaf4;
}

.time {
  width: 42px;
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.mode {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--paper-deep);
  color: var(--ink-2);
}

.mode.sequence {
  background: var(--blue-tint);
  color: var(--blue);
}

.mode.transfer {
  background: var(--amber-tint);
  color: var(--amber-ink);
}

.feed-name {
  font-weight: 600;
}

.delta {
  margin-left: auto;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.delta.up {
  color: var(--green);
}

.delta.down {
  color: var(--red);
}

/* ---------- 侧栏 ---------- */
.weights {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.w-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 5px;
  font-size: 12.5px;
}

.w-pct {
  margin-left: auto;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.formula {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px dashed var(--line);
  font-size: 11px;
  color: var(--muted);
}

.mini-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.mini-stats > div {
  background: #fbf9f3;
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mini-stats b {
  font-size: 20px;
  font-weight: 800;
}

.rule-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.rule-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
  color: var(--ink-2);
}

.side-note {
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.7;
  padding: 0 4px;
}

/* ---------- 弹层 ---------- */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(20, 28, 23, 0.42);
  display: grid;
  place-items: center;
  z-index: 60;
  padding: 20px;
}

.modal {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: 16px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 24px 60px rgba(20, 28, 23, 0.25);
}

.modal h3 {
  font-size: 16px;
}

.modal select {
  width: 100%;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
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
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
}

.empty.small {
  padding: 18px 0;
  font-size: 12.5px;
}

@media (max-width: 1080px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .side-col {
    order: 2;
  }
}

@media (max-width: 640px) {
  .name {
    font-size: 34px;
  }
  .hero-card-face {
    width: 96px;
    height: 96px;
  }
  .hero-main {
    gap: 12px;
  }
}
</style>
