// 부족 스펙 진단 + 가성비 성장 경로 계산

const { STAT_KEYS } = require('./stats');

// ── 기대 시도 횟수 (연속 실패 보너스/천장 반영) ──
// rate: 기본 성공률, pity[k]: (k+1)번 연속 실패 후 다음 시도에 더해지는 보너스
function expectedAttempts(rate, pity = []) {
  if (rate >= 1) return 1;
  if (!pity.length) return 1 / rate;
  let reach = 1; // 이 시도까지 올 확률
  let expected = 0;
  for (let fails = 0; fails <= pity.length; fails++) {
    expected += reach;
    const bonus = fails === 0 ? 0 : pity[fails - 1];
    const p = Math.min(1, rate + bonus);
    reach *= 1 - p;
    if (reach <= 0) return expected;
  }
  // 천장이 없는 표라면 마지막 확률로 기하분포 꼬리 처리
  const last = Math.min(1, rate + pity[pity.length - 1]);
  return expected + reach / last;
}

// ── 비용 계산 ──
function priceCost(cost, prices) {
  let gold = cost.gold || 0;
  const missing = [];
  const breakdown = [];
  for (const [name, qty] of Object.entries(cost.items || {})) {
    const p = prices[name];
    if (p === undefined || p === null) {
      missing.push(name);
      breakdown.push({ name, qty, unit: null });
    } else {
      gold += p * qty;
      breakdown.push({ name, qty, unit: p });
    }
  }
  return { gold, missing, breakdown, baseGold: cost.gold || 0 };
}

// 액션의 "다음 한 단계"를 구한다. 진행도(progress)는 이미 한 횟수/현재 단계.
function nextStep(action, done, opts) {
  if (action.type === 'repeat') {
    if (done >= action.maxSteps) return null;
    const mult = action.luckyEligible ? opts.luckyMultiplier : 1;
    const gain = {};
    for (const [k, v] of Object.entries(action.gain)) gain[k] = v * mult;
    return { label: `${done + 1}회차`, gain, rate: 1, pity: [], cost: action.cost };
  }
  if (action.type === 'sequence') {
    return action.steps[done] || null;
  }
  if (action.type === 'once') {
    return done >= 1 ? null : { label: '적용', gain: action.gain, rate: 1, pity: [], cost: action.cost };
  }
  return null;
}

function diagnose(stats, dungeon) {
  const rows = [];
  for (const [k, need] of Object.entries(dungeon.minStats)) {
    const have = stats[k];
    rows.push({
      stat: k,
      need,
      have: have ?? null,
      gap: have === undefined || have === null ? null : Math.max(0, need - have),
      ok: have !== undefined && have !== null && have >= need,
    });
  }
  const unknown = rows.filter((r) => r.have === null).map((r) => r.stat);
  const pass = rows.every((r) => r.ok);
  return { rows, pass, unknown };
}

// 단계 하나가 부족분을 얼마나 메우는지 (각 스탯 부족분 대비 비율의 합)
// 단계 하나가 부족분을 얼마나 메우는지. 스탯이 줄어드는 단계(정령석 교체 등)는
// 부족한 스탯을 깎거나 여유 있는 스탯을 요구치 아래로 떨어뜨리면 제외(-Infinity).
function stepValue(gain, remaining, original, surplus = {}) {
  let v = 0;
  for (const [k, g] of Object.entries(gain)) {
    if (g < 0) {
      // 부족한 스탯을 더 깎거나, 충족한 스탯을 요구치 아래로 떨어뜨리는 단계는 고르지 않는다
      if (original[k]) return -Infinity;
      if (surplus[k] !== undefined && surplus[k] + g < 0) return -Infinity;
      continue;
    }
    if (!original[k] || remaining[k] <= 0) continue;
    v += Math.min(g, remaining[k]) / original[k];
  }
  return v;
}

/**
 * @param stats       현재 스탯 {atk, def, ...}
 * @param dungeon     목표 던전
 * @param catalog     성장 액션 목록
 * @param prices      { 아이템이름: 개당 골드 }
 * @param progress    { actionId: 진행한 횟수/단계 }
 * @param disabled    [actionId] 계산에서 뺄 것
 * @param opts        { luckyMultiplier, maxIterations }
 */
function advise({ stats, dungeon, catalog, prices = {}, progress = {}, disabled = [], opts = {} }) {
  const o = { luckyMultiplier: 1, maxIterations: 5000, ...opts };
  const diag = diagnose(stats, dungeon);
  const original = {};
  for (const r of diag.rows) if (r.gap > 0) original[r.stat] = r.gap;
  const remaining = { ...original };
  // 이미 충족한 스탯의 여유분 (줄어드는 단계가 이 아래로 떨어뜨리면 안 됨)
  const surplus = {};
  for (const r of diag.rows) if (r.ok) surplus[r.stat] = r.have - r.need;

  const state = {};
  for (const a of catalog) state[a.id] = Math.max(0, Number(progress[a.id]) || 0);
  const off = new Set(disabled);

  const evalStep = (a) => {
    const step = nextStep(a, state[a.id], o);
    if (!step) return null;
    const attempts = expectedAttempts(step.rate, step.pity);
    const c = priceCost(step.cost, prices);
    const value = stepValue(step.gain, remaining, original, surplus);
    return { step, attempts, cost: c.gold * attempts, missing: c.missing, value, breakdown: c.breakdown };
  };

  // ① 스탯별 가성비 순위 (지금 상태에서 "다음 한 단계" 기준, 1포인트당 골드)
  const perStat = {};
  for (const k of Object.keys(original)) {
    const list = [];
    for (const a of catalog) {
      if (off.has(a.id)) continue;
      const e = evalStep(a);
      if (!e || !(e.step.gain[k] > 0)) continue;
      list.push({
        actionId: a.id, name: a.name, group: a.group, stepLabel: e.step.label,
        gain: e.step.gain[k], costPerPoint: e.cost / e.step.gain[k], partial: e.missing.length > 0,
        missing: e.missing, attempts: e.attempts, risky: !!a.risky, requires: a.requires || null,
        losses: Object.entries(e.step.gain).filter(([, g]) => g < 0).map(([stat, g]) => ({ stat, g })),
        blockedByLoss: e.value === -Infinity,
      });
    }
    // 시세가 다 확인된 방법을 먼저, 그 안에서 싼 순서
    list.sort((x, y) => (x.partial - y.partial) || (x.costPerPoint - y.costPerPoint));
    // 이 스탯을 올릴 수 있지만 지금은 못 하는 방법 (이미 끝까지 함 / 계산에서 꺼짐)
    const raises = (a) => (a.gain && a.gain[k] > 0) || (a.steps || []).some((st) => st.gain[k] > 0);
    for (const a of catalog) {
      if (!raises(a) || list.some((x) => x.actionId === a.id)) continue;
      list.push({ actionId: a.id, name: a.name, group: a.group, status: off.has(a.id) ? 'off' : 'maxed', requires: a.requires || null });
    }
    perStat[k] = list;
  }

  // ② 부족분을 모두 메우는 최저 비용 경로 (탐욕법: 매번 '부족분 1%당 비용'이 가장 싼 다음 단계 선택)
  const steps = [];
  const blocked = []; // 시세를 몰라서 제외된 후보
  let iter = 0;
  while (Object.values(remaining).some((v) => v > 0) && iter++ < o.maxIterations) {
    // 시세가 모두 확인된 방법 중 가장 싼 것을 고르고, 그런 방법이 없을 때만
    // 일부 재료 시세를 모르는 방법을 '아는 비용'만으로 비교해 고른다.
    let best = null;
    let bestPartial = null;
    for (const a of catalog) {
      if (off.has(a.id)) continue;
      const e = evalStep(a);
      if (!e || e.value <= 0) continue;
      const eff = e.cost / (e.value * 100); // 부족분 1%당 골드
      if (e.missing.length) {
        if (!blocked.find((b) => b.actionId === a.id)) blocked.push({ actionId: a.id, name: a.name, missing: e.missing });
        if (!bestPartial || eff < bestPartial.eff) bestPartial = { a, e, eff };
        continue;
      }
      if (!best || eff < best.eff) best = { a, e, eff };
    }
    best = best || bestPartial;
    if (!best) break;
    const { a, e, eff } = best;
    for (const [k, g] of Object.entries(e.step.gain)) {
      if (remaining[k] !== undefined) remaining[k] = Math.max(0, remaining[k] - g);
      else if (surplus[k] !== undefined) surplus[k] += g;
    }
    steps.push({ actionId: a.id, name: a.name, group: a.group, target: a.target, stepLabel: e.step.label, gain: e.step.gain, cost: e.cost, attempts: e.attempts, eff, missing: e.missing, breakdown: e.breakdown, risky: !!a.risky, requires: a.requires || null, source: a.source });
    state[a.id] += 1;
  }

  // 같은 액션의 단계를 하나로 묶고, 첫 단계를 고른 순서(=가성비 순)대로 보여준다
  const plan = [];
  const byId = new Map();
  for (const s of steps) {
    const last = byId.get(s.actionId);
    if (last) {
      last.count += 1;
      last.cost += s.cost;
      last.toLabel = s.stepLabel;
      for (const m of s.missing) if (!last.missing.includes(m)) last.missing.push(m);
      for (const [k, v] of Object.entries(s.gain)) last.gain[k] = (last.gain[k] || 0) + v;
      for (const b of s.breakdown) {
        const m = last.materials[b.name] || { qty: 0, unit: b.unit };
        m.qty += b.qty * s.attempts;
        last.materials[b.name] = m;
      }
      last.goldDirect += (s.cost / s.attempts - s.breakdown.reduce((t, b) => t + (b.unit || 0) * b.qty, 0)) * s.attempts;
    } else {
      const materials = {};
      for (const b of s.breakdown) materials[b.name] = { qty: b.qty * s.attempts, unit: b.unit };
      const row = {
        actionId: s.actionId, name: s.name, group: s.group, target: s.target,
        fromLabel: s.stepLabel, toLabel: s.stepLabel, count: 1, cost: s.cost,
        gain: { ...s.gain }, materials, risky: s.risky, requires: s.requires, source: s.source,
        missing: [...s.missing],
        avgEff: 0,
        goldDirect: (s.cost / s.attempts - s.breakdown.reduce((t, b) => t + (b.unit || 0) * b.qty, 0)) * s.attempts,
      };
      byId.set(s.actionId, row);
      plan.push(row);
    }
  }
  for (const p of plan) {
    let v = 0;
    for (const [k, g] of Object.entries(p.gain)) if (original[k]) v += g / original[k];
    p.avgEff = v > 0 ? p.cost / (v * 100) : null;
  }

  const totalCost = plan.reduce((s, p) => s + p.cost, 0);
  const unpricedInPlan = [...new Set(plan.flatMap((p) => p.missing))];
  // 계획에 실제로 들어간 방법은 '빠진 방법' 목록에서 뺀다
  const planned = new Set(plan.map((p) => p.actionId));
  for (let i = blocked.length - 1; i >= 0; i--) if (planned.has(blocked[i].actionId)) blocked.splice(i, 1);
  const unresolved = Object.entries(remaining).filter(([, v]) => v > 0).map(([stat, gap]) => ({ stat, gap }));
  const projected = { ...stats };
  for (const p of plan) for (const [k, g] of Object.entries(p.gain)) if (projected[k] !== undefined) projected[k] += g;

  return {
    dungeon: { id: dungeon.id, name: dungeon.name, pureStatsOnly: !!dungeon.pureStatsOnly },
    diagnosis: diag,
    plan,
    totalCost,
    unresolved,
    projected,
    perStat,
    blocked,
    unpricedInPlan,
    // 계산 후보가 왜 없는지 설명용: 꺼진 방법 / 이미 끝까지 한 방법
    availability: (() => {
      const offList = []; const maxed = [];
      for (const a of catalog) {
        if (off.has(a.id)) offList.push(a.name);
        else if (!nextStep(a, Math.max(0, Number(progress[a.id]) || 0), o)) maxed.push(a.name);
      }
      return { total: catalog.length, off: offList, maxed };
    })(),
    assumptions: {
      luckyMultiplier: o.luckyMultiplier,
    },
  };
}

// 계산에 필요한 거래소 아이템 이름 전체
function itemsInCatalog(catalog) {
  const set = new Set();
  const add = (c) => Object.keys(c.items || {}).forEach((n) => set.add(n));
  for (const a of catalog) {
    if (a.cost) add(a.cost);
    if (a.steps) a.steps.forEach((s) => add(s.cost));
  }
  return [...set].sort();
}

module.exports = { advise, diagnose, expectedAttempts, itemsInCatalog, STAT_KEYS };
