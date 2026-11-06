<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { api, downloadUrl } from '../api.js';
import { initial } from '../utils.js';

const loading = ref(true);
const students = ref([]);
const stats = ref({});
const majors = ref([]);
const search = ref('');
const major = ref('');
const className = ref('');
const classes = ref([]);
const sort = ref('no');
const toast = ref('');
const importing = ref(false);

const editorOpen = ref(false);
const editing = reactive({ id: null, student_no: '', name: '', major: '', class_name: '' });
const saving = ref(false);

let toastTimer = null;
let searchTimer = null;

const fileInput = ref(null);

const majorOptions = computed(() => majors.value.map((m) => m.major).filter(Boolean));

function showToast(message) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 2600);
}

async function load() {
  const payload = await api.students({
    search: search.value,
    major: major.value,
    className: className.value,
    sort: sort.value,
  });
  students.value = payload.students;
  stats.value = payload.stats;
  classes.value = payload.classes ?? [];
  loading.value = false;
}

async function loadMajors() {
  const payload = await api.majors();
  majors.value = payload.majors;
}

watch([major, sort, className], load);
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 250);
});

function openCreate() {
  Object.assign(editing, { id: null, student_no: '', name: '', major: majorOptions.value[0] ?? '', class_name: '' });
  editorOpen.value = true;
}

function openEdit(row) {
  Object.assign(editing, {
    id: row.id,
    student_no: row.student_no,
    name: row.name,
    major: row.major,
    class_name: row.class_name,
  });
  editorOpen.value = true;
}

async function save() {
  if (!editing.student_no.trim() || !editing.name.trim()) {
    showToast('学号和姓名不能为空');
    return;
  }
  saving.value = true;
  try {
    if (editing.id) {
      await api.updateStudent(editing.id, editing);
      showToast('已保存修改');
    } else {
      await api.createStudent(editing);
      showToast('已添加学生');
    }
    editorOpen.value = false;
    await Promise.all([load(), loadMajors()]);
  } catch (error) {
    showToast(error.message);
  } finally {
    saving.value = false;
  }
}

async function remove(row) {
  if (!window.confirm(`删除 ${row.name}（${row.student_no}）？该同学的积分与点名记录会一并删除。`)) return;
  try {
    await api.removeStudent(row.id);
    showToast('已删除');
    await Promise.all([load(), loadMajors()]);
  } catch (error) {
    showToast(error.message);
  }
}

async function clearAll() {
  if (!window.confirm('确定清空全部学生名单？点名记录、积分流水与徽章会一并删除，且不可恢复。')) return;
  const typed = window.prompt('这一步不可撤销。请输入「清空」两个字确认：');
  if (typed !== '清空') return;
  try {
    await api.resetStudents();
    showToast('已清空名单，可以导入新名单了');
    await Promise.all([load(), loadMajors()]);
  } catch (error) {
    showToast(error.message);
  }
}

function pickFile() {
  fileInput.value?.click();
}

async function onFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  importing.value = true;
  try {
    const result = await api.importStudents(file);
    showToast(`导入完成：新增 ${result.inserted} 人，更新 ${result.updated} 人`);
    if (result.skipped?.length) showToast(`另有 ${result.skipped.length} 行缺少学号或姓名被跳过`);
    await Promise.all([load(), loadMajors()]);
  } catch (error) {
    showToast(error.message);
  } finally {
    importing.value = false;
    event.target.value = '';
  }
}

onMounted(async () => {
  await Promise.all([load(), loadMajors()]);
});
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">学生名单</h1>
        <p class="page-sub">支持 Excel 导入（学号 / 姓名 / 专业 / 班级），重复导入按学号更新</p>
      </div>
      <div class="head-actions">
        <button class="btn" :disabled="importing" @click="pickFile">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 20V9" /><path d="m8 13 4-4 4 4" /><path d="M5 5h14" /></svg>
          {{ importing ? '导入中…' : '导入 Excel' }}
        </button>
        <button class="btn" @click="openCreate">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
          手动添加
        </button>
        <a class="btn btn-primary" :href="downloadUrl('/export')">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 4v11" /><path d="m8 11 4 4 4-4" /><path d="M5 19h14" /></svg>
          导出积分详单
        </a>
        <a class="btn btn-sm btn-ghost" :href="downloadUrl('/students/template')">下载模板</a>
        <button class="btn btn-sm btn-ghost danger" @click="clearAll">清空名单</button>
        <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" hidden @change="onFile" />
      </div>
    </div>

    <div class="kpis">
      <div class="kpi card">
        <span class="tiny muted">学生总数</span>
        <b>{{ stats.students ?? 0 }}</b>
        <span class="tiny muted">{{ majorOptions.length }} 个专业方向</span>
      </div>
      <div class="kpi card">
        <span class="tiny muted">专业覆盖</span>
        <b>{{ majorOptions.length }}</b>
        <span class="tiny muted">按「专业」列自动统计</span>
      </div>
      <div class="kpi card">
        <span class="tiny muted">班级平均分</span>
        <b>{{ stats.avgScore ?? 0 }}</b>
        <span class="tiny muted">初始 0 分，到场 +1 起</span>
      </div>
      <div class="kpi card">
        <span class="tiny muted">可用接力徽章</span>
        <b>{{ stats.badges ?? 0 }}</b>
        <span class="tiny muted">每被点 3 次发 1 枚</span>
      </div>
    </div>

    <section class="card">
      <div class="toolbar">
        <div class="search">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
          <input v-model="search" placeholder="搜索姓名 / 学号" />
        </div>
        <select v-model="className" class="input">
          <option value="">全部班级</option>
          <option v-for="item in classes" :key="item.class_name" :value="item.class_name">
            {{ item.class_name }}班（{{ item.count }}）
          </option>
        </select>
        <select v-model="major" class="input">
          <option value="">全部专业</option>
          <option v-for="item in majorOptions" :key="item" :value="item">{{ item }}</option>
        </select>
        <select v-model="sort" class="input">
          <option value="no">按学号排序</option>
          <option value="score">按总积分排序</option>
          <option value="calls">按被点次数排序</option>
          <option value="name">按姓名排序</option>
        </select>
        <span class="hint muted tiny">共 {{ students.length }} 人</span>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th style="width: 34%">学生</th>
              <th>专业</th>
              <th>班级</th>
              <th style="text-align: right">总积分</th>
              <th style="text-align: right">随机点名</th>
              <th style="text-align: right">顺序点名</th>
              <th style="text-align: right">到场</th>
              <th style="text-align: center">徽章</th>
              <th style="width: 84px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in students" :key="row.id">
              <td>
                <div class="who">
                  <span class="avatar">{{ initial(row.name) }}</span>
                  <div class="who-text">
                    <b>{{ row.name }}</b>
                    <span class="tiny muted">{{ row.student_no }}</span>
                  </div>
                </div>
              </td>
              <td><span class="pill">{{ row.major || '未填' }}</span></td>
              <td class="muted">{{ row.class_name || '—' }}</td>
              <td style="text-align: right"><b class="score">{{ row.total_score }}</b></td>
              <td style="text-align: right" class="muted">{{ row.random_calls }}</td>
              <td style="text-align: right" class="muted">{{ row.sequence_calls }}</td>
              <td style="text-align: right" class="muted">{{ row.present_count }}</td>
              <td style="text-align: center">
                <span v-if="row.badges > 0" class="pill amber">🎖 {{ row.badges }}</span>
                <span v-else class="muted tiny">—</span>
              </td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn" title="编辑" @click="openEdit(row)">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M15.5 5.5 18.5 8.5 8 19H5v-3z" /></svg>
                  </button>
                  <button class="icon-btn danger" title="删除" @click="remove(row)">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 7h12" /><path d="M9 7V5h6v2" /><path d="M8 7v12h8V7" /></svg>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!students.length && !loading">
              <td colspan="9">
                <div class="empty">
                  <p>还没有学生。点右上角「导入 Excel」，或先</p>
                  <button class="btn btn-sm" @click="openCreate">手动添加一位</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <transition name="fade">
      <div v-if="editorOpen" class="modal-mask" @click.self="editorOpen = false">
        <div class="modal">
          <h3>{{ editing.id ? '编辑学生' : '添加学生' }}</h3>
          <label class="field"><span>学号</span><input v-model="editing.student_no" class="input" placeholder="如 20240101" /></label>
          <label class="field"><span>姓名</span><input v-model="editing.name" class="input" placeholder="如 陈知远" /></label>
          <label class="field"><span>专业</span><input v-model="editing.major" class="input" list="major-list" placeholder="如 计算机科学与技术" /></label>
          <datalist id="major-list">
            <option v-for="item in majorOptions" :key="item" :value="item" />
          </datalist>
          <label class="field"><span>班级（可选）</span><input v-model="editing.class_name" class="input" placeholder="如 2024级 计科 1 班" /></label>
          <div class="modal-actions">
            <button class="btn" @click="editorOpen = false">取消</button>
            <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
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
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.btn.danger {
  color: var(--red);
}

.btn.danger:hover {
  background: var(--red-tint);
  color: var(--red);
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
  gap: 2px;
}

.kpi b {
  font-size: 28px;
  font-weight: 800;
  line-height: 1.2;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line-soft);
  flex-wrap: wrap;
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
  color: var(--muted);
  flex: 1;
  min-width: 200px;
  max-width: 340px;
}

.search input {
  border: 0;
  outline: none;
  background: transparent;
  width: 100%;
}

.hint {
  margin-left: auto;
}

.table-wrap {
  overflow-x: auto;
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

.score {
  font-size: 14.5px;
  color: var(--green);
  font-variant-numeric: tabular-nums;
}

.row-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.icon-btn:hover {
  background: var(--paper-deep);
  color: var(--ink);
}

.icon-btn.danger:hover {
  background: var(--red-tint);
  color: var(--red);
}

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
  max-width: 400px;
  background: #fff;
  border-radius: 16px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 24px 60px rgba(20, 28, 23, 0.25);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12.5px;
  color: var(--muted);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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

@media (max-width: 960px) {
  .kpis {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
