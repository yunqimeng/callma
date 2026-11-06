export const fmtTime = (iso) => {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const fmtDelta = (n) => {
  const value = Number(n ?? 0);
  if (value > 0) return `+${Number.isInteger(value) ? value : value.toFixed(1)}`;
  if (value === 0) return '0';
  return `${Number.isInteger(value) ? value : value.toFixed(1)}`;
};

export const pct = (value, digits = 1) => `${(Number(value ?? 0) * 100).toFixed(digits)}%`;

export const initial = (name = '') => (name ? name.slice(-2) : '?');

export const modeLabel = (mode) =>
  ({ random: '随机', sequence: '顺序', transfer: '接力' }[mode] ?? mode);

export const todayLabel = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
