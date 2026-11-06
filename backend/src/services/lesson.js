import { get, run, now } from '../db/index.js';
import { DEFAULT_RULES, normalizeRules } from '../domain/rules.js';

let cached = null;

export async function getRules() {
  const row = await get('SELECT payload FROM rule_config WHERE id = 1');
  if (!row) return cached ?? normalizeRules(DEFAULT_RULES);
  try {
    cached = normalizeRules(JSON.parse(row.payload));
  } catch {
    cached = normalizeRules(DEFAULT_RULES);
  }
  return cached;
}

export async function saveRules(input) {
  const rules = normalizeRules(input);
  const payload = JSON.stringify(rules);
  const existing = await get('SELECT id FROM rule_config WHERE id = 1');
  if (existing) {
    await run('UPDATE rule_config SET payload = ?, updated_at = ? WHERE id = 1', [payload, now()]);
  } else {
    await run('INSERT INTO rule_config (id, payload, updated_at) VALUES (1, ?, ?)', [payload, now()]);
  }
  cached = rules;
  return rules;
}

export async function ensureActiveLesson() {
  const lesson = await get("SELECT * FROM lessons WHERE status = 'active' ORDER BY id DESC LIMIT 1");
  if (lesson) return lesson;
  const { insertId } = await run("INSERT INTO lessons (title, status, started_at) VALUES (?, 'active', ?)", [
    '课堂点名 · 进行中',
    now(),
  ]);
  return { id: insertId, title: '课堂点名 · 进行中', status: 'active', started_at: now() };
}
