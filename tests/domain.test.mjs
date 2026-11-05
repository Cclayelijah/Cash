import assert from "node:assert/strict";
import test from "node:test";
import {
  bucketSales,
  crossedRecord,
  dateKey,
  dollarAmount,
  normalizeGuest,
  parseGoalDollars,
  parseSaleDollars,
  nextRecordCelebration,
  priorRecordCents,
  rangeForCustom,
  rangeForPreset,
  recordPresentation,
  reportCsv,
  summarize,
  todaySales,
  usd,
} from "../js/domain.js";

const at = (year, month, day, hour = 12) => new Date(year, month - 1, day, hour).getTime();

test("parses sale and goal amounts", () => {
  assert.equal(parseSaleDollars("$1,250.50"), 125050);
  assert.equal(parseSaleDollars("-20"), -2000);
  assert.equal(parseSaleDollars("0"), null);
  assert.equal(parseSaleDollars("nope"), null);
  assert.equal(parseGoalDollars("500"), 50000);
  assert.equal(parseGoalDollars("0"), 0);
  assert.equal(parseGoalDollars("-5"), null);
});

test("formats locked en-US money", () => {
  assert.equal(usd(12550), "$125.50");
  assert.equal(usd(-2000), "-$20.00");
  assert.equal(dollarAmount(-2000), "-20.00");
});

test("keeps earlier guest sales when a new day starts", () => {
  const guest = normalizeGuest({
    date: "2026-11-04",
    goalCents: 50000,
    sales: [{ id: "a", cents: 40000, at: at(2026, 11, 4, 15) }],
  }, new Date(2026, 10, 5, 9));
  assert.equal(guest.sales.length, 1);
  assert.equal(todaySales(guest.sales, new Date(2026, 10, 5, 9)).length, 0);
  assert.equal(priorRecordCents(guest.sales, new Date(2026, 10, 5, 9)), 40000);
});

test("personal record ignores today and uses the best earlier day", () => {
  const now = new Date(2026, 10, 5, 18);
  const sales = [
    { id: "a", cents: 10000, at: at(2026, 11, 3) },
    { id: "b", cents: 25000, at: at(2026, 11, 3, 16) },
    { id: "c", cents: 90000, at: at(2026, 11, 4) },
    { id: "d", cents: 5000, at: at(2026, 11, 5) },
  ];
  assert.equal(priorRecordCents(sales, now), 90000);
  assert.equal(priorRecordCents([{ id: "d", cents: 5000, at: at(2026, 11, 5) }], now), null);
});

test("congratulates only on a strict crossing", () => {
  assert.equal(crossedRecord(40000, 60000, 50000), true);
  assert.equal(crossedRecord(50000, 50000, 50000), false);
  assert.equal(crossedRecord(60000, 70000, 50000), false);
  assert.equal(crossedRecord(0, 100, null), false);
  assert.deepEqual(recordPresentation({ todayCents: 60000, priorCents: 50000, celebrate: true }), {
    mode: "burst",
    text: "New daily record. $600.00, beating $500.00.",
  });
  assert.equal(recordPresentation({ todayCents: 60000, priorCents: 50000, celebrate: false }).mode, "quiet");
  assert.equal(recordPresentation({ todayCents: 100, priorCents: null, celebrate: true }).mode, "none");
  assert.equal(recordPresentation({ todayCents: 50000, priorCents: 50000, celebrate: true }).mode, "none");
});

test("a new day or account does not replay the record burst", () => {
  const cleared = nextRecordCelebration({ celebrate: true, burst: true }, { kind: "clear" });
  assert.deepEqual(cleared, { celebrate: false, burst: false });
  assert.deepEqual(
    recordPresentation({ todayCents: 0, priorCents: -4000, celebrate: cleared.celebrate }),
    { mode: "quiet", text: "Daily record" },
  );
  assert.deepEqual(
    nextRecordCelebration(cleared, {
      kind: "sales",
      beforeCents: 40000,
      afterCents: 60000,
      priorCents: 50000,
    }),
    { celebrate: true, burst: true },
  );
  assert.deepEqual(
    nextRecordCelebration(
      { celebrate: true, burst: false },
      { kind: "sales", beforeCents: 60000, afterCents: 70000, priorCents: 50000 },
    ),
    { celebrate: true, burst: false },
  );
  assert.deepEqual(
    nextRecordCelebration(
      { celebrate: true, burst: false },
      { kind: "sales", beforeCents: 70000, afterCents: 40000, priorCents: 50000 },
    ),
    { celebrate: false, burst: false },
  );
});

test("buckets a custom range by day, including empty days", () => {
  const sales = [
    { id: "a", cents: 1000, at: at(2026, 11, 1, 10) },
    { id: "b", cents: 2500, at: at(2026, 11, 3, 10) },
  ];
  const range = rangeForCustom("2026-11-01", "2026-11-03");
  const buckets = bucketSales(sales, "day", range.start, range.end);
  assert.equal(buckets.length, 3);
  assert.deepEqual(buckets.map((bucket) => bucket.cents), [1000, 0, 2500]);
  assert.equal(summarize(buckets).count, 2);
  assert.equal(summarize(buckets).averageCents, 1750);
});

test("rejects a custom range that ends before it starts", () => {
  assert.equal(rangeForCustom("2026-11-05", "2026-11-01"), null);
  assert.equal(rangeForCustom("yesterday", "2026-11-01"), null);
});

test("preset ranges stay inside the local calendar", () => {
  const now = new Date(2026, 10, 5, 13);
  const week = rangeForPreset("week", now);
  const month = rangeForPreset("month", now);
  const year = rangeForPreset("year", now);
  const twelve = rangeForPreset("twelve", now);
  assert.equal(week.start.getDay(), 0);
  assert.ok(week.start <= now && now < week.end);
  assert.equal(month.start.getDate(), 1);
  assert.equal(year.start.getMonth(), 0);
  assert.equal(dateKey(twelve.start), "2025-12-01");
  assert.equal(dateKey(week.end), "2026-11-06");
});

test("month buckets add the days inside that month", () => {
  const sales = [
    { id: "a", cents: 4000, at: at(2026, 11, 2) },
    { id: "b", cents: -500, at: at(2026, 11, 20) },
  ];
  const range = rangeForCustom("2026-11-01", "2026-11-30");
  const buckets = bucketSales(sales, "month", range.start, range.end);
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].cents, 3500);
  assert.equal(buckets[0].count, 2);
});

test("csv matches the buckets and escapes commas", () => {
  const csv = reportCsv([
    { label: "Week of Nov 1, 2026", count: 2, cents: 3500 },
  ]);
  assert.equal(csv, 'Period,Sales,Total\r\n"Week of Nov 1, 2026",2,35.00\r\n');
});
