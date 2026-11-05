export const DEFAULT_GOAL_CENTS = 50000;
export const STORAGE_KEY = "cash-today-v1";

const moneyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function endOfDayExclusive(date) {
  return addDays(startOfDay(date), 1);
}

export function startOfWeek(date) {
  const start = startOfDay(date);
  return addDays(start, -start.getDay());
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1);
}

export function usd(cents) {
  return moneyFormat.format(cents / 100);
}

export function dollarAmount(cents) {
  return (cents / 100).toFixed(2);
}

export function amountParts(cents) {
  const parts = moneyFormat.formatToParts(cents / 100);
  let sign = "";
  let dollars = "";
  let fraction = "00";
  for (const part of parts) {
    if (part.type === "minusSign") sign = "-";
    if (part.type === "integer" || part.type === "group") dollars += part.value;
    if (part.type === "fraction") fraction = part.value;
  }
  return { sign, dollars, fraction };
}

export function formatGoalInput(cents) {
  const amount = cents / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

export function parseSaleDollars(raw) {
  return parseMoney(raw, true, false);
}

export function parseGoalDollars(raw) {
  return parseMoney(raw, false, true);
}

function parseMoney(raw, allowNegative, allowZero) {
  const cleaned = String(raw ?? "").trim().replace(/[$,\s]/g, "");
  if (cleaned === "" || cleaned === "." || cleaned === "-" || cleaned === "-.") return null;
  const pattern = allowNegative ? /^-?\d*\.?\d+$/ : /^\d*\.?\d+$/;
  if (!pattern.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  if (!allowNegative && value < 0) return null;
  if (!allowZero && value === 0) return null;
  return Math.round(value * 100);
}

export function msUntilMidnight(now) {
  return endOfDayExclusive(now).getTime() - now.getTime();
}

export function formatDuration(ms) {
  if (ms <= 0) return "0m";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function cleanSales(sales) {
  if (!Array.isArray(sales)) return [];
  const cleaned = [];
  for (const sale of sales) {
    if (!sale || typeof sale.id !== "string" && typeof sale.id !== "number") continue;
    if (!Number.isFinite(sale.cents)) continue;
    const at = Number(sale.at);
    if (!Number.isFinite(at)) continue;
    cleaned.push({ id: String(sale.id), cents: Math.round(sale.cents), at });
  }
  return cleaned;
}

export function normalizeGuest(raw, now = new Date()) {
  const source = raw && typeof raw === "object" ? raw : {};
  const goalCents = Number.isFinite(source.goalCents)
    ? Math.max(0, Math.round(source.goalCents))
    : DEFAULT_GOAL_CENTS;
  return { goalCents, sales: cleanSales(source.sales) };
}

export function sumCents(sales) {
  return sales.reduce((sum, sale) => sum + sale.cents, 0);
}

export function todaySales(sales, now = new Date()) {
  const today = dateKey(now);
  return sales.filter((sale) => dateKey(new Date(sale.at)) === today);
}

export function priorRecordCents(sales, now = new Date()) {
  const today = dateKey(now);
  const totals = new Map();
  for (const sale of sales) {
    const key = dateKey(new Date(sale.at));
    if (key >= today) continue;
    totals.set(key, (totals.get(key) ?? 0) + sale.cents);
  }
  if (totals.size === 0) return null;
  let best = null;
  for (const cents of totals.values()) {
    if (best === null || cents > best) best = cents;
  }
  return best;
}

export function crossedRecord(beforeCents, afterCents, priorCents) {
  return priorCents !== null && beforeCents <= priorCents && afterCents > priorCents;
}

export function nextRecordCelebration(state, event) {
  if (event.kind === "clear") return { celebrate: false, burst: false };
  if (event.kind !== "sales") throw new Error(`Unknown record event: ${event.kind}`);
  if (crossedRecord(event.beforeCents, event.afterCents, event.priorCents)) {
    return { celebrate: true, burst: true };
  }
  if (event.priorCents === null || event.afterCents <= event.priorCents) {
    return { celebrate: false, burst: false };
  }
  return { celebrate: state.celebrate, burst: state.burst };
}

export function recordPresentation({ todayCents, priorCents, celebrate }) {
  if (priorCents === null || todayCents <= priorCents) return { mode: "none", text: "" };
  if (celebrate) {
    return {
      mode: "burst",
      text: `New daily record. ${usd(todayCents)}, beating ${usd(priorCents)}.`,
    };
  }
  return { mode: "quiet", text: "Daily record" };
}

export function rangeForPreset(preset, now) {
  const end = endOfDayExclusive(now);
  if (preset === "week") return { start: startOfWeek(now), end };
  if (preset === "month") return { start: startOfMonth(now), end };
  if (preset === "year") return { start: startOfYear(now), end };
  if (preset === "twelve") return { start: new Date(now.getFullYear(), now.getMonth() - 11, 1), end };
  throw new Error(`Unknown preset: ${preset}`);
}

export function rangeForCustom(startKey, endKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey) || !/^\d{4}-\d{2}-\d{2}$/.test(endKey)) return null;
  const start = parseDateKey(startKey);
  const end = endOfDayExclusive(parseDateKey(endKey));
  if (Number.isNaN(start.getTime()) || end <= start) return null;
  return { start, end };
}

export function bucketSales(sales, group, start, end) {
  const buckets = [];
  let cursor = bucketStart(start, group);
  let guard = 0;
  while (cursor < end && guard < 20000) {
    const next = nextBucket(cursor, group);
    const from = Math.max(cursor.getTime(), start.getTime());
    const to = Math.min(next.getTime(), end.getTime());
    let cents = 0;
    let count = 0;
    for (const sale of sales) {
      if (sale.at >= from && sale.at < to) {
        cents += sale.cents;
        count += 1;
      }
    }
    buckets.push({
      start: cursor.getTime(),
      label: bucketLabel(cursor, group),
      cents,
      count,
    });
    cursor = next;
    guard += 1;
  }
  return buckets;
}

function bucketStart(date, group) {
  if (group === "day") return startOfDay(date);
  if (group === "week") return startOfWeek(date);
  if (group === "month") return startOfMonth(date);
  if (group === "year") return startOfYear(date);
  throw new Error(`Unknown group: ${group}`);
}

function nextBucket(date, group) {
  if (group === "day") return addDays(date, 1);
  if (group === "week") return addDays(date, 7);
  if (group === "month") return new Date(date.getFullYear(), date.getMonth() + 1, 1);
  if (group === "year") return new Date(date.getFullYear() + 1, 0, 1);
  throw new Error(`Unknown group: ${group}`);
}

function bucketLabel(date, group) {
  if (group === "day") {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
  }
  if (group === "week") {
    const formatted = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
    return `Week of ${formatted}`;
  }
  if (group === "month") {
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
  }
  if (group === "year") return String(date.getFullYear());
  throw new Error(`Unknown group: ${group}`);
}

export function summarize(buckets) {
  const cents = buckets.reduce((sum, bucket) => sum + bucket.cents, 0);
  const count = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  return { cents, count, averageCents: count === 0 ? 0 : Math.round(cents / count) };
}

export function reportCsv(buckets) {
  const lines = ["Period,Sales,Total"];
  for (const bucket of buckets) {
    lines.push(`${csvCell(bucket.label)},${bucket.count},${dollarAmount(bucket.cents)}`);
  }
  return `${lines.join("\r\n")}\r\n`;
}

function csvCell(value) {
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function paceLabel(remainingCents, msLeft) {
  if (msLeft <= 0) return "Day is over";
  return `${usd(remainingCents / (msLeft / 36e5))}/hr to finish`;
}
