import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";
import { accountsEnabled, authRedirectUrl, supabaseKey, supabaseUrl } from "./config.js";
import {
  DEFAULT_GOAL_CENTS,
  STORAGE_KEY,
  amountParts,
  bucketSales,
  dateKey,
  formatDuration,
  formatGoalInput,
  msUntilMidnight,
  normalizeGuest,
  paceLabel,
  parseGoalDollars,
  parseSaleDollars,
  nextRecordCelebration,
  priorRecordCents,
  rangeForCustom,
  rangeForPreset,
  recordPresentation,
  reportCsv,
  sumCents,
  summarize,
  todaySales,
  usd,
} from "./domain.js";

const els = {
  app: document.getElementById("app"),
  todayView: document.getElementById("today-view"),
  dashboardView: document.getElementById("dashboard-view"),
  dock: document.getElementById("today-dock"),
  date: document.getElementById("date"),
  clock: document.getElementById("clock"),
  fullscreen: document.getElementById("fullscreen"),
  viewToday: document.getElementById("view-today"),
  viewDashboard: document.getElementById("view-dashboard"),
  accountOpen: document.getElementById("account-open"),
  eyebrow: document.getElementById("eyebrow"),
  amount: document.getElementById("amount"),
  sign: document.getElementById("sign"),
  dollars: document.getElementById("dollars"),
  cents: document.getElementById("cents"),
  meterFill: document.getElementById("meter-fill"),
  ofGoal: document.getElementById("of-goal"),
  record: document.getElementById("record"),
  timeLeft: document.getElementById("time-left"),
  gapLabel: document.getElementById("gap-label"),
  gap: document.getElementById("gap"),
  pace: document.getElementById("pace"),
  sales: document.getElementById("sales"),
  saleForm: document.getElementById("sale-form"),
  saleInput: document.getElementById("sale-input"),
  goalInput: document.getElementById("goal-input"),
  importSales: document.getElementById("import-sales"),
  notice: document.getElementById("notice"),
  group: document.getElementById("dash-group"),
  preset: document.getElementById("dash-preset"),
  custom: document.getElementById("dash-custom"),
  start: document.getElementById("dash-start"),
  end: document.getElementById("dash-end"),
  download: document.getElementById("download-report"),
  dashTotal: document.getElementById("dash-total"),
  dashCount: document.getElementById("dash-count"),
  dashAverage: document.getElementById("dash-average"),
  chart: document.getElementById("chart"),
  dialog: document.getElementById("auth-dialog"),
  authForm: document.getElementById("auth-form"),
  authTitle: document.getElementById("auth-title"),
  authMessage: document.getElementById("auth-message"),
  authEmail: document.getElementById("auth-email"),
  passwordField: document.getElementById("password-field"),
  authPassword: document.getElementById("auth-password"),
  authSubmit: document.getElementById("auth-submit"),
  authSwitch: document.getElementById("auth-switch"),
  authReset: document.getElementById("auth-reset"),
  authClose: document.getElementById("auth-close"),
  accountPanel: document.getElementById("account-panel"),
  accountEmail: document.getElementById("account-email"),
  newPassword: document.getElementById("new-password"),
  savePassword: document.getElementById("save-password"),
  signOut: document.getElementById("sign-out"),
  deleteAccount: document.getElementById("delete-account"),
  deleteField: document.getElementById("delete-field"),
  deleteConfirm: document.getElementById("delete-confirm"),
};

const supabase = accountsEnabled()
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

let guest = loadGuest();
let session = null;
let accountSales = [];
let profileGoal = null;
let view = "today";
let authMode = "sign-in";
let sessionRecordMessage = false;
let burstPending = false;
let recordScope = "";
let shownCents = 0;
let tweenToken = 0;
let fittedLength = -1;
let renderedDate = "";
let chart;
let loadToken = 0;
let latestBuckets = [];

function loadGuest() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeGuest(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeGuest(null);
  }
}

function saveGuest() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(guest));
  } catch {
    showNotice("This browser blocked saving on the device.");
  }
}

function uid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mapRow(row) {
  return { id: row.id, cents: row.cents, at: new Date(row.sold_at).getTime() };
}

function ledger() {
  return session ? accountSales : guest.sales;
}

function goalCents() {
  return session ? (profileGoal ?? DEFAULT_GOAL_CENTS) : guest.goalCents;
}

function currentRecordScope(now) {
  return `${session?.user?.id ?? "guest"}:${dateKey(now)}`;
}

function applyRecordEvent(event) {
  const next = nextRecordCelebration(
    { celebrate: sessionRecordMessage, burst: burstPending },
    event,
  );
  sessionRecordMessage = next.celebrate;
  burstPending = next.burst;
}

function syncRecordScope(now) {
  const scope = currentRecordScope(now);
  if (recordScope && scope !== recordScope) applyRecordEvent({ kind: "clear" });
  recordScope = scope;
}

function noteToday(before, after, prior, now) {
  syncRecordScope(now);
  applyRecordEvent({
    kind: "sales",
    beforeCents: before,
    afterCents: after,
    priorCents: prior,
  });
}

function showNotice(text) {
  els.notice.hidden = !text;
  els.notice.textContent = text;
}

function shake(input) {
  input.classList.remove("shake");
  void input.offsetWidth;
  input.classList.add("shake");
}

function fitAmount() {
  const maxWidth = els.todayView.clientWidth * 0.92;
  const maxHeight = Math.min(els.todayView.clientHeight * 0.36, window.innerHeight * 0.32);
  if (maxWidth < 40 || maxHeight < 40) return;
  let size = Math.min(maxWidth * 0.42, maxHeight / 0.9);
  els.amount.style.fontSize = `${size}px`;
  let guard = 0;
  while (els.amount.scrollWidth > maxWidth && size > 48 && guard < 6) {
    size *= maxWidth / els.amount.scrollWidth;
    els.amount.style.fontSize = `${size}px`;
    guard += 1;
  }
}

function paintAmount(cents) {
  const parts = amountParts(cents);
  els.sign.textContent = parts.sign;
  els.dollars.textContent = `$${parts.dollars}`;
  els.cents.textContent = `.${parts.fraction}`;
  const length = `${parts.sign}${parts.dollars}`.length;
  if (length !== fittedLength) {
    fittedLength = length;
    fitAmount();
  }
}

function renderAmount(target, tween) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!tween || reduce || target === shownCents) {
    shownCents = target;
    paintAmount(target);
    return;
  }
  const from = shownCents;
  const token = ++tweenToken;
  const start = performance.now();
  function frame(now) {
    if (token !== tweenToken) return;
    const progress = Math.min(1, (now - start) / 480);
    const eased = 1 - (1 - progress) ** 3;
    shownCents = progress === 1 ? target : Math.round(from + (target - from) * eased);
    paintAmount(shownCents);
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function renderClock(now) {
  els.date.textContent = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
  els.clock.textContent = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);
  const earned = sumCents(todaySales(ledger(), now));
  const goal = goalCents();
  const remaining = goal - earned;
  const msLeft = msUntilMidnight(now);
  const met = goal > 0 && remaining <= 0;
  els.timeLeft.textContent = formatDuration(msLeft);
  els.timeLeft.classList.toggle("is-urgent", goal > 0 && !met && msLeft > 0 && msLeft < 30 * 60 * 1000);
  if (goal <= 0) {
    els.gapLabel.textContent = "Daily goal";
    els.gap.textContent = "Not set";
    els.pace.textContent = "";
    return;
  }
  if (met) {
    els.gapLabel.textContent = "Over goal";
    els.gap.textContent = usd(earned - goal);
    els.pace.textContent = "Goal reached";
    return;
  }
  els.gapLabel.textContent = "Still to go";
  els.gap.textContent = usd(remaining);
  els.pace.textContent = paceLabel(remaining, msLeft);
}

function renderToday(now, tween) {
  const sales = todaySales(ledger(), now);
  const earned = sumCents(sales);
  const goal = goalCents();
  const met = goal > 0 && earned >= goal;
  els.app.classList.toggle("is-met", met);
  const percent = goal > 0 ? (earned / goal) * 100 : 0;
  els.meterFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  els.ofGoal.replaceChildren();
  if (goal <= 0) {
    els.ofGoal.textContent = "Set a daily goal";
  } else {
    const strong = document.createElement("strong");
    strong.textContent = usd(earned);
    els.ofGoal.append(strong, ` of ${usd(goal)} · ${Math.round(percent)}%`);
  }
  const presentation = recordPresentation({
    todayCents: earned,
    priorCents: priorRecordCents(ledger(), now),
    celebrate: sessionRecordMessage,
  });
  els.record.hidden = presentation.mode === "none";
  els.record.textContent = presentation.text;
  els.record.classList.toggle("is-burst", presentation.mode === "burst" && burstPending);
  if (presentation.mode === "burst") burstPending = false;
  const count = sales.length;
  els.eyebrow.textContent = count === 0
    ? "Made today"
    : `Made today · ${count} ${count === 1 ? "sale" : "sales"}`;
  els.sales.replaceChildren();
  for (const sale of sales) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = sale.cents < 0 ? "chip is-refund" : "chip";
    button.dataset.id = sale.id;
    const when = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(sale.at);
    button.title = `${when} · click to remove`;
    button.setAttribute("aria-label", `Remove ${usd(sale.cents)} sale from ${when}`);
    button.textContent = usd(sale.cents);
    els.sales.append(button);
  }
  const pending = guest.sales.length;
  els.importSales.hidden = !session || pending === 0;
  els.importSales.textContent = `Import ${pending} device ${pending === 1 ? "sale" : "sales"}`;
  if (document.activeElement !== els.goalInput) {
    els.goalInput.value = formatGoalInput(goal);
  }
  renderAmount(earned, tween);
  document.title = `${usd(earned)} today`;
}

function currentRange(now) {
  if (els.preset.value === "custom") return rangeForCustom(els.start.value, els.end.value);
  return rangeForPreset(els.preset.value, now);
}

function renderDashboard(now) {
  els.custom.hidden = els.preset.value !== "custom";
  const range = currentRange(now);
  if (!range) {
    latestBuckets = [];
    showNotice("Choose a valid date range.");
    return;
  }
  latestBuckets = bucketSales(accountSales, els.group.value, range.start, range.end);
  const summary = summarize(latestBuckets);
  els.dashTotal.textContent = usd(summary.cents);
  els.dashCount.textContent = String(summary.count);
  els.dashAverage.textContent = usd(summary.averageCents);
  paintChart(latestBuckets);
}

function paintChart(buckets) {
  if (typeof Chart === "undefined") return;
  const data = {
    labels: buckets.map((bucket) => bucket.label),
    datasets: [{
      data: buckets.map((bucket) => bucket.cents / 100),
      backgroundColor: "#8ee0a8",
      borderRadius: 4,
      maxBarThickness: 28,
    }],
  };
  if (chart) {
    chart.data.labels = data.labels;
    chart.data.datasets[0].data = data.datasets[0].data;
    chart.update();
    return;
  }
  chart = new Chart(els.chart, {
    type: "bar",
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(item) {
              return usd(latestBuckets[item.dataIndex]?.cents ?? 0);
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: "#9398a3", maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: "#9398a3" }, grid: { color: "rgba(245,246,248,0.08)" } },
      },
    },
  });
}

function render({ tween = false } = {}) {
  const now = new Date();
  syncRecordScope(now);
  renderedDate = dateKey(now);
  const showingToday = view === "today";
  els.todayView.hidden = !showingToday;
  els.dock.hidden = !showingToday;
  els.dashboardView.hidden = showingToday || !session;
  els.viewToday.setAttribute("aria-pressed", String(showingToday));
  els.viewDashboard.setAttribute("aria-pressed", String(!showingToday));
  els.accountOpen.textContent = session?.user?.email ?? "Sign in";
  renderClock(now);
  if (showingToday) renderToday(now, tween);
  else renderDashboard(now);
}

function showView(next) {
  if (next === "dashboard" && !session) {
    openAuth("sign-in");
    showAuth("Sign in to open the dashboard.");
    return;
  }
  view = next;
  render();
  if (next === "dashboard" && chart) chart.resize();
}

function openAuth(mode) {
  if (!supabase) {
    showNotice("Accounts are not connected on this copy of the app.");
    return;
  }
  setAuthMode(session && mode === "account" ? "account" : mode);
  if (!els.dialog.open) els.dialog.showModal();
}

function setAuthMode(mode) {
  authMode = mode;
  const account = mode === "account";
  els.accountPanel.hidden = !account;
  els.authForm.hidden = account;
  els.deleteField.hidden = true;
  els.deleteConfirm.value = "";
  if (account) {
    els.authTitle.textContent = "Account";
    els.accountEmail.textContent = session?.user?.email ?? "";
    return;
  }
  const copy = {
    "sign-in": ["Sign in", "Sign in", "Create an account"],
    "sign-up": ["Create account", "Create account", "Already have an account?"],
    reset: ["Reset password", "Send reset link", "Back to sign in"],
  };
  const [title, submit, switchLabel] = copy[mode];
  els.authTitle.textContent = title;
  els.authSubmit.textContent = submit;
  els.authSwitch.textContent = switchLabel;
  els.passwordField.hidden = mode === "reset";
  els.authReset.hidden = mode !== "sign-in";
}

function showAuth(text) {
  els.authMessage.textContent = text;
}

async function submitAuth(event) {
  event.preventDefault();
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  if (!email) {
    showAuth("Enter an email.");
    return;
  }
  try {
    if (authMode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl });
      if (error) throw error;
      showAuth("Password reset email sent.");
      return;
    }
    if (password.length < 6) {
      showAuth("Use at least 6 characters.");
      return;
    }
    if (authMode === "sign-up") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: authRedirectUrl },
      });
      if (error) throw error;
      if (!data.session) {
        showAuth("Check your email to confirm the account, then sign in.");
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    els.authPassword.value = "";
    showAuth("");
    els.dialog.close();
  } catch (error) {
    showAuth(error.message);
  }
}

async function ensureProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("daily_goal_cents")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data.daily_goal_cents;
  const { error: insertError } = await supabase.from("profiles").insert({ id: userId });
  if (insertError && insertError.code !== "23505") throw insertError;
  return DEFAULT_GOAL_CENTS;
}

async function loadAccount(userId) {
  const { data, error } = await supabase
    .from("sales")
    .select("id,cents,sold_at")
    .eq("user_id", userId)
    .order("sold_at", { ascending: false });
  if (error) throw error;
  return data.map(mapRow);
}

async function handleSession(next) {
  const token = ++loadToken;
  session = next;
  if (!next) {
    accountSales = [];
    profileGoal = null;
    if (view === "dashboard") view = "today";
    render();
    return;
  }
  try {
    const [goal, rows] = await Promise.all([
      ensureProfile(next.user.id),
      loadAccount(next.user.id),
    ]);
    if (token !== loadToken) return;
    profileGoal = goal;
    accountSales = rows;
    showNotice("");
  } catch (error) {
    if (token !== loadToken) return;
    showNotice(error.message);
  }
  render();
}

async function addSale() {
  const cents = parseSaleDollars(els.saleInput.value);
  if (cents === null) {
    shake(els.saleInput);
    return;
  }
  const now = new Date();
  const before = sumCents(todaySales(ledger(), now));
  if (!session) {
    guest.sales.unshift({ id: uid(), cents, at: now.getTime() });
    saveGuest();
    noteToday(before, sumCents(todaySales(guest.sales, now)), priorRecordCents(guest.sales, now), now);
    els.saleInput.value = "";
    render({ tween: true });
    els.saleInput.focus();
    return;
  }
  els.saleInput.disabled = true;
  const { data, error } = await supabase
    .from("sales")
    .insert({ cents, sold_at: now.toISOString() })
    .select("id,cents,sold_at")
    .single();
  els.saleInput.disabled = false;
  if (error) {
    showNotice(error.message);
    shake(els.saleInput);
    return;
  }
  accountSales.unshift(mapRow(data));
  noteToday(before, sumCents(todaySales(accountSales, now)), priorRecordCents(accountSales, now), now);
  els.saleInput.value = "";
  showNotice("");
  render({ tween: true });
  els.saleInput.focus();
}

async function removeSale(id) {
  const now = new Date();
  const before = sumCents(todaySales(ledger(), now));
  if (!session) {
    guest.sales = guest.sales.filter((sale) => sale.id !== id);
    saveGuest();
    noteToday(before, sumCents(todaySales(guest.sales, now)), priorRecordCents(guest.sales, now), now);
    render({ tween: true });
    return;
  }
  const { error } = await supabase.from("sales").delete().eq("id", id).eq("user_id", session.user.id);
  if (error) {
    showNotice(error.message);
    return;
  }
  accountSales = accountSales.filter((sale) => sale.id !== id);
  noteToday(before, sumCents(todaySales(accountSales, now)), priorRecordCents(accountSales, now), now);
  showNotice("");
  render({ tween: true });
}

async function importGuestSales() {
  if (!session || guest.sales.length === 0) return;
  const now = new Date();
  const before = sumCents(todaySales(accountSales, now));
  const rows = guest.sales.map((sale) => ({ cents: sale.cents, sold_at: new Date(sale.at).toISOString() }));
  const { data, error } = await supabase.from("sales").insert(rows).select("id,cents,sold_at");
  if (error) {
    showNotice(error.message);
    return;
  }
  accountSales = [...data.map(mapRow), ...accountSales];
  guest.sales = [];
  saveGuest();
  noteToday(before, sumCents(todaySales(accountSales, now)), priorRecordCents(accountSales, now), now);
  showNotice("");
  render({ tween: true });
}

async function commitGoal() {
  const raw = els.goalInput.value.trim();
  if (raw === "") {
    els.goalInput.value = formatGoalInput(goalCents());
    return;
  }
  const next = parseGoalDollars(raw);
  if (next === null) {
    els.goalInput.value = formatGoalInput(goalCents());
    shake(els.goalInput);
    return;
  }
  if (!session) {
    guest.goalCents = next;
    saveGuest();
    render();
    return;
  }
  const { error } = await supabase.from("profiles").update({ daily_goal_cents: next }).eq("id", session.user.id);
  if (error) {
    showNotice(error.message);
    els.goalInput.value = formatGoalInput(goalCents());
    return;
  }
  profileGoal = next;
  showNotice("");
  render();
}

function downloadReport() {
  const range = currentRange(new Date());
  if (!range) {
    showNotice("Choose a valid date range.");
    return;
  }
  const csv = reportCsv(latestBuckets);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sales-report.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    // Fullscreen can be rejected without a direct gesture.
  }
}

function syncFullscreenButton() {
  const on = document.fullscreenElement != null;
  els.fullscreen.setAttribute("aria-pressed", String(on));
  els.fullscreen.setAttribute("aria-label", on ? "Exit full screen" : "Enter full screen");
  els.fullscreen.title = on ? "Exit full screen (F)" : "Full screen (F)";
}

els.saleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void addSale();
});
els.goalInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  void commitGoal();
  els.goalInput.blur();
});
els.goalInput.addEventListener("blur", () => void commitGoal());
els.goalInput.addEventListener("animationend", () => els.goalInput.classList.remove("shake"));
els.saleInput.addEventListener("animationend", () => els.saleInput.classList.remove("shake"));
els.sales.addEventListener("click", (event) => {
  const button = event.target.closest(".chip");
  if (!button) return;
  void removeSale(button.dataset.id);
});
els.importSales.addEventListener("click", () => void importGuestSales());
els.viewToday.addEventListener("click", () => showView("today"));
els.viewDashboard.addEventListener("click", () => showView("dashboard"));
els.accountOpen.addEventListener("click", () => openAuth(session ? "account" : "sign-in"));
els.authClose.addEventListener("click", () => els.dialog.close());
els.authForm.addEventListener("submit", (event) => void submitAuth(event));
els.authSwitch.addEventListener("click", () => {
  setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in");
  showAuth("");
});
els.authReset.addEventListener("click", () => {
  setAuthMode("reset");
  showAuth("");
});
els.group.addEventListener("change", () => render());
els.preset.addEventListener("change", () => render());
els.start.addEventListener("change", () => render());
els.end.addEventListener("change", () => render());
els.download.addEventListener("click", downloadReport);
els.savePassword.addEventListener("click", async () => {
  if (els.newPassword.value.length < 6) {
    showNotice("Use at least 6 characters.");
    return;
  }
  const { error } = await supabase.auth.updateUser({ password: els.newPassword.value });
  if (error) {
    showNotice(error.message);
    return;
  }
  els.newPassword.value = "";
  showNotice("Password updated.");
});
els.signOut.addEventListener("click", async () => {
  await supabase.auth.signOut({ scope: "local" });
  els.dialog.close();
});
els.deleteAccount.addEventListener("click", async () => {
  if (els.deleteField.hidden) {
    els.deleteField.hidden = false;
    els.deleteConfirm.focus();
    return;
  }
  if (els.deleteConfirm.value !== "DELETE") {
    showNotice("Type DELETE to remove the account.");
    return;
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    showNotice(await response.text());
    return;
  }
  await supabase.auth.signOut({ scope: "local" });
  els.dialog.close();
  showNotice("");
});
els.fullscreen.addEventListener("click", () => void toggleFullscreen());
document.addEventListener("fullscreenchange", () => {
  syncFullscreenButton();
  fitAmount();
});
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() !== "f" || event.metaKey || event.ctrlKey || event.altKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  event.preventDefault();
  void toggleFullscreen();
});
window.addEventListener("resize", fitAmount);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && session) void handleSession(session);
  else if (document.visibilityState === "visible") render();
});

const today = dateKey(new Date());
els.start.value = `${today.slice(0, 8)}01`;
els.end.value = today;
render();
setInterval(() => {
  if (dateKey(new Date()) !== renderedDate) render();
  else renderClock(new Date());
}, 1000);

if (supabase) {
  supabase.auth.onAuthStateChange((_event, next) => {
    void handleSession(next);
  });
}
