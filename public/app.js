// 마영전 스펙 진단기 — 화면 로직 (서버 /api/* 만 호출)

const $ = (s, el = document) => el.querySelector(s);
const fmt = (n) => (n === null || n === undefined || !Number.isFinite(n) ? '-' : Math.round(n).toLocaleString('ko-KR'));
const fmtGold = (n) => {
  if (!Number.isFinite(n)) return '-';
  if (n >= 1e8) return `${(n / 1e8).toFixed(n >= 1e9 ? 1 : 2).replace(/\.?0+$/, '')}억`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString('ko-KR')}만`;
  return Math.round(n).toLocaleString('ko-KR');
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const S = {
  meta: null,
  dungeons: [],
  catalog: [],
  stats: store.get('hs.stats', {}),
  apiStats: {},
  progress: store.get('hs.progress', {}),
  disabled: null,
  overrides: store.get('hs.overrides', {}),
  prices: {},
  dungeonId: store.get('hs.dungeon', null),
  lucky: store.get('hs.lucky', 1),
  statTab: null,
  lastResult: null,
};

async function api(path, opts) {
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `요청 실패 (${res.status})`);
  return body;
}

// ───────────── 스탯 입력 ─────────────
function renderStatForm() {
  const box = $('#statForm');
  box.innerHTML = S.meta.statKeys.map((k) => `
    <label class="${S.apiStats[k] !== undefined ? 'from-api' : ''}">${esc(S.meta.statLabels[k])}
      <input type="number" inputmode="numeric" data-stat="${k}" value="${S.stats[k] ?? ''}" placeholder="0">
    </label>`).join('');
  box.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', () => {
    const v = inp.value.trim();
    if (v === '') delete S.stats[inp.dataset.stat]; else S.stats[inp.dataset.stat] = Number(v);
    store.set('hs.stats', S.stats);
    renderLadder();
    scheduleAdvise();
  }));
}

$('#lookupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#charName').value.trim();
  const msg = $('#lookupMsg');
  msg.className = 'msg';
  msg.textContent = '불러오는 중…';
  try {
    const r = await api(`/api/character?name=${encodeURIComponent(name)}`);
    if (r.mock) {
      // 목업 모드에서는 남의 예시 스탯을 내 캐릭터 것처럼 채우지 않는다
      msg.className = 'msg err';
      msg.innerHTML = `지금은 목업 모드라 '${esc(name)}'의 실제 스탯을 불러올 수 없어요. <code>.env</code> 파일에 <code>NEXON_API_KEY</code>를 넣고 서버를 다시 켜 주세요. 스탯을 아래에 직접 입력해도 됩니다. <button type="button" class="ghost" id="useSample">예시 스탯으로 체험하기</button>`;
      $('#useSample').addEventListener('click', () => {
        S.apiStats = {};
        S.stats = { ...r.stats };
        store.set('hs.stats', S.stats);
        msg.className = 'msg';
        msg.textContent = '예시 캐릭터의 스탯을 넣었어요. 실제 캐릭터 스탯이 아닙니다.';
        renderStatForm(); renderLadder(); scheduleAdvise();
      });
      return;
    }
    S.apiStats = r.stats;
    // 새로 불러오면 이전 값(예시 스탯이나 다른 캐릭터 값)이 섞이지 않게 통째로 바꾼다
    S.stats = { ...r.stats };
    store.set('hs.stats', S.stats);
    applyEquipment(r.equipment);
    const lv = r.basic?.character_level ? `, ${r.basic.character_level}레벨` : '';
    msg.textContent = r.missing.length
      ? `${r.name}${lv} 불러옴. 응답에 없던 스탯(${r.missing.map((k) => S.meta.statLabels[k]).join(', ')})은 직접 입력해 주세요.`
      : `${r.name}${lv} 스탯을 불러왔어요.`;
    renderStatForm();
    renderLadder();
    scheduleAdvise();
  } catch (err) {
    msg.className = 'msg err';
    msg.textContent = `${err.message} — 이름을 확인하거나 스탯을 직접 입력해 주세요.`;
  }
});

// 장비 API에서 연마 횟수·강화 단계·승급 등급·인챈트를 채운다
function applyEquipment(eq) {
  const box = $('#equipSummary');
  if (!eq) {
    box.innerHTML = '<p class="hint">장비 정보를 불러오지 못해 장비 진행 상황은 직접 입력해야 해요.</p>';
    return;
  }
  S.progress = { ...S.progress, ...eq.progress };
  store.set('hs.progress', S.progress);
  const off = new Set(S.disabled);
  for (const [id, on] of Object.entries(eq.enable)) { if (on) off.delete(id); else off.add(id); }
  S.disabled = [...off];
  store.set('hs.disabled', S.disabled);
  renderGear();
  const SLOT = { 'Right Hand': '무기', 'Left Hand': '보조', Head: '머리', Upper: '가슴', Lower: '다리', Hand: '손', Leg: '발', Rhod: '로드', 'Right Finger': '반지', 'Left Finger': '반지', Earring: '귀걸이', Belt: '벨트', Charm: '브로치', Artifact: '아티팩트', 'Right Wrist': '팔찌', 'Left Wrist': '팔찌', Necklace: '목걸이' };
  const noEnchant = '<span class="none">없음</span>';
  box.innerHTML = `<details class="equip" open><summary>장착 장비와 인챈트 (${eq.items.length}개)</summary>
    <table class="equip-table">
      <thead><tr><th>부위</th><th>장비</th><th>접두</th><th>접미</th></tr></thead>
      <tbody>${eq.items.map((i) => `<tr>
        <td class="eslot">${esc(SLOT[i.slot] || i.slot)}</td>
        <td>${esc(i.name)}${i.enhancement ? ` <span class="enh">+${i.enhancement}</span>` : ''}</td>
        <td>${i.prefix ? esc(i.prefix) : noEnchant}</td>
        <td>${i.suffix ? esc(i.suffix) : noEnchant}</td>
      </tr>`).join('')}</tbody>
    </table>
    <p class="hint">장비 진행 상황(연마·강화·승급·인챈트)에도 자동으로 반영했어요.</p>
    ${eq.notes.map((n) => `<p class="hint">${esc(n)}</p>`).join('')}</details>`;
}

// ───────────── 던전 사다리 ─────────────
function statusFor(d) {
  const keys = Object.keys(d.minStats);
  const known = keys.filter((k) => Number.isFinite(S.stats[k]));
  if (!known.length) return { state: 'unknown', short: [] };
  const short = keys.filter((k) => Number.isFinite(S.stats[k]) && S.stats[k] < d.minStats[k]);
  const unknown = keys.filter((k) => !Number.isFinite(S.stats[k]));
  if (short.length) return { state: 'fail', short, unknown };
  if (unknown.length) return { state: 'unknown', short, unknown };
  return { state: 'pass', short, unknown };
}

function renderLadder() {
  const list = [...S.dungeons].sort((a, b) => a.minStats.atk - b.minStats.atk || a.minStats.def - b.minStats.def);
  const ol = $('#ladder');
  const hasStats = Object.keys(S.stats).length > 0;
  let youPlaced = !hasStats;
  const html = [];
  for (const d of list) {
    const st = statusFor(d);
    if (!youPlaced && st.state !== 'pass') {
      html.push(`<li class="you-line" aria-hidden="true">내 캐릭터는 여기까지 입장 가능</li>`);
      youPlaced = true;
    }
    const verdict = st.state === 'pass' ? '입장 가능' : st.state === 'fail' ? `${st.short.length}개 스탯 부족` : (hasStats ? '스탯 일부 미입력' : '');
    const reqs = Object.entries(d.minStats).map(([k, v]) =>
      `<span class="${st.short.includes(k) ? 'short' : ''}">${esc(S.meta.statLabels[k])} <b>${fmt(v)}</b></span>`).join('');
    const meta = [d.category, `${d.level}레벨`, `${d.party}인`, d.boss].filter(Boolean).join(', ');
    html.push(`<li class="rung ${st.state} ${d.id === S.dungeonId ? 'selected' : ''}" tabindex="0" role="button" aria-pressed="${d.id === S.dungeonId}" data-id="${d.id}">
      <div><div class="dname">${esc(d.name)}</div><div class="dmeta">${esc(meta)}${d.pureStatsOnly ? ', 순수 능력치 판정' : ''}</div></div>
      <div class="verdict">${verdict}</div>
      <div class="reqs">${reqs}</div>
    </li>`);
  }
  if (!youPlaced) html.push(`<li class="you-line" aria-hidden="true">모든 던전 입장 가능</li>`);
  ol.innerHTML = html.join('');
  ol.querySelectorAll('.rung').forEach((li) => {
    const pick = () => { S.dungeonId = li.dataset.id; store.set('hs.dungeon', S.dungeonId); renderLadder(); runAdvise(); };
    li.addEventListener('click', pick);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
}

// ───────────── 장비 진행 상황 ─────────────
function renderGear() {
  const groups = {};
  for (const a of S.catalog) (groups[a.group] ||= []).push(a);
  const box = $('#gearList');
  box.innerHTML = Object.entries(groups).map(([g, items]) => `
    <div class="gear-group"><h3>${esc(g)}${g === '장신구 강화' ? ' (반지는 2개만 체크)' : ''}</h3>
      ${items.map((a) => gearRow(a)).join('')}
    </div>`).join('');
  box.querySelectorAll('[data-toggle]').forEach((cb) => cb.addEventListener('change', () => {
    const id = cb.dataset.toggle;
    S.disabled = cb.checked ? S.disabled.filter((x) => x !== id) : [...S.disabled, id];
    store.set('hs.disabled', S.disabled);
    cb.closest('.gear-item').classList.toggle('off', !cb.checked);
    scheduleAdvise();
  }));
  box.querySelectorAll('[data-prog]').forEach((el) => el.addEventListener('change', () => {
    const a = S.catalog.find((x) => x.id === el.dataset.prog);
    let v = Math.max(0, Math.floor(Number(el.value) || 0));
    if (a.type === 'repeat') v = Math.min(v, a.maxSteps);
    S.progress[a.id] = v;
    el.value = v;
    store.set('hs.progress', S.progress);
    scheduleAdvise();
  }));
}

function gearRow(a) {
  const on = !S.disabled.includes(a.id);
  const p = S.progress[a.id] || 0;
  let ctrl = '';
  if (a.type === 'repeat') {
    ctrl = `<span><input type="number" min="0" max="${a.maxSteps}" value="${p}" data-prog="${a.id}" aria-label="${esc(a.name)} 진행 횟수"> <span class="max">/ ${a.maxSteps}회</span></span>`;
  } else if (a.type === 'sequence') {
    const labels = a.gradeNames
      ? a.gradeNames.map((g, i) => [i, g])
      : Array.from({ length: a.steps.length + 1 }, (_, i) => [i, `${i}강`]);
    ctrl = `<select data-prog="${a.id}" aria-label="${esc(a.name)} 현재 단계">${labels.map(([i, l]) => `<option value="${i}" ${i === p ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  } else {
    ctrl = `<select data-prog="${a.id}" aria-label="${esc(a.name)} 적용 여부"><option value="0" ${p ? '' : 'selected'}>미적용</option><option value="1" ${p ? 'selected' : ''}>적용함</option></select>`;
  }
  const label = a.group === '연마' ? a.name.replace(/^.*?연마: /, `${a.target} `) : a.target;
  return `<div class="gear-item ${on ? '' : 'off'}">
    <input type="checkbox" ${on ? 'checked' : ''} data-toggle="${a.id}" aria-label="${esc(a.name)} 계산에 포함">
    <span class="gname" title="${esc(a.requires || a.note || '')}">${esc(label)}</span>${ctrl}
  </div>`;
}

$('#lucky').addEventListener('change', (e) => {
  const v = Math.min(3, Math.max(1, Number(e.target.value) || 1));
  e.target.value = v;
  S.lucky = v;
  store.set('hs.lucky', v);
  scheduleAdvise();
});

// ───────────── 재료 시세 ─────────────
function renderPrices() {
  const names = Object.keys(S.prices).sort();
  $('#priceList').innerHTML = names.map((n) => {
    const p = S.prices[n];
    return `<div class="price-row"><span>${esc(n)}</span>
      <span class="cur ${p.unit == null ? 'none' : ''}" title="${p.samples ? `거래 ${p.samples}건 기준` : ''}">${p.unit == null ? '시세 없음' : fmt(p.unit)}</span>
      <input type="number" min="0" data-price="${esc(n)}" value="${S.overrides[n] ?? ''}" placeholder="직접 입력" aria-label="${esc(n)} 가격 직접 입력"></div>`;
  }).join('');
  $('#priceList').querySelectorAll('[data-price]').forEach((inp) => inp.addEventListener('change', () => setOverride(inp.dataset.price, inp.value)));
}

function setOverride(name, value) {
  if (value === '' || value === null) delete S.overrides[name];
  else S.overrides[name] = Number(value);
  store.set('hs.overrides', S.overrides);
  const other = document.querySelectorAll(`[data-price="${CSS.escape(name)}"]`);
  other.forEach((x) => { if (x.value !== String(value ?? '')) x.value = value ?? ''; });
  scheduleAdvise();
}

// ───────────── 추천 계산 ─────────────
let timer = null;
function scheduleAdvise() { clearTimeout(timer); timer = setTimeout(runAdvise, 350); }

async function runAdvise() {
  const d = S.dungeons.find((x) => x.id === S.dungeonId);
  if (!d) return;
  if (!Object.keys(S.stats).length) {
    $('#result').hidden = false;
    $('#resultTitle').textContent = `${d.name}: 부족한 스탯`;
    $('#resultSub').textContent = '왼쪽에서 캐릭터를 불러오거나 스탯을 입력하면 계산합니다.';
    ['#gaps', '#planSummary', '#planTable', '#unresolved', '#blocked', '#perStatTabs', '#perStatTable', '#warnings'].forEach((s) => { $(s).innerHTML = ''; });
    return;
  }
  try {
    const r = await api('/api/advise', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stats: S.stats, dungeonId: d.id, progress: S.progress, disabled: S.disabled, priceOverrides: S.overrides, opts: { luckyMultiplier: S.lucky } }),
    });
    S.lastResult = r;
    renderResult(r, d);
  } catch (err) {
    $('#result').hidden = false;
    $('#resultSub').textContent = err.message;
  }
}

function gainText(gain) {
  return Object.entries(gain).filter(([, v]) => v > 0)
    .map(([k, v]) => `${S.meta.statLabels[k].replace(/\(.*\)/, '')} +${fmt(v)}`).join(', ');
}

function renderResult(r, d) {
  $('#result').hidden = false;
  const diag = r.diagnosis;
  $('#resultTitle').textContent = `${d.name}: ${diag.pass ? '입장 조건을 모두 채웠어요' : '부족한 스탯'}`;
  $('#resultSub').innerHTML = `빠른 전투 최소 입장 능력치 기준${d.pureStatsOnly ? ' (순수 능력치 판정)' : ''}. <a href="${esc(d.source)}" target="_blank" rel="noopener">출처 패치노트</a>`;

  $('#warnings').innerHTML = (r.warnings || []).map((w) => `<p class="warn">${esc(w)}</p>`).join('');

  $('#gaps').innerHTML = diag.rows.map((row) => {
    const label = S.meta.statLabels[row.stat].replace(/\(.*\)/, '');
    if (row.have === null) return `<div class="gauge"><span class="gl">${esc(label)}</span><div class="track"></div><span class="gv">미입력 (필요 ${fmt(row.need)})</span></div>`;
    // 대부분 요구치의 90% 이상이라 0~100%로 그리면 차이가 안 보인다 → 요구치의 80%~100% 구간만 확대
    const scale = (v) => Math.max(0, Math.min(100, ((v / row.need - 0.8) / 0.2) * 100));
    const pct = scale(row.have);
    const proj = r.projected[row.stat];
    const projPct = proj !== undefined && proj > row.have ? scale(proj) : null;
    return `<div class="gauge ${row.ok ? 'ok' : ''}">
      <span class="gl">${esc(label)}</span>
      <div class="track" role="img" aria-label="${esc(label)} ${fmt(row.have)} / ${fmt(row.need)}">
        <div class="fill" style="width:${pct}%"></div>
        ${projPct && !row.ok ? `<div class="proj" style="left:calc(${projPct}% - 1px)" title="추천 경로 완료 후 ${fmt(proj)}"></div>` : ''}
      </div>
      <span class="gv">${row.ok ? `<b>충족</b> ${fmt(row.have)}` : `<b>−${fmt(row.gap)}</b> (${fmt(row.have)} / ${fmt(row.need)})`}</span>
    </div>`;
  }).join('') + `<p class="gauge-note">막대는 요구치의 80%~100% 구간을 확대해 보여줍니다. 파란 세로선은 추천 경로를 마친 뒤의 예상치예요.</p>`;

  // 추천 경로
  if (diag.pass) {
    $('#planSummary').innerHTML = `<span class="note">이 던전의 입장 조건을 이미 모두 넘어서 채울 부족분이 없어요. 위 목록에서 빨간 표시(스탯 부족)가 있는 던전을 고르면 성장 순서가 나옵니다.</span>`;
    $('#planTable').innerHTML = '';
    $('#shopping').innerHTML = '';
  } else {
    const solved = r.unresolved.length === 0;
    $('#planSummary').innerHTML = `
      <span><span class="big">${fmtGold(r.totalCost)}</span> 골드</span>
      <span class="note">${solved ? '이대로 하면 모든 부족분이 채워집니다.' : '계산 가능한 방법만으로는 일부가 남습니다 (아래 참고).'} 강화 비용은 연속 실패 보너스까지 반영한 기대값입니다.</span>
      ${r.unpricedInPlan?.length ? `<p class="warn" style="flex-basis:100%">거래소 시세를 못 찾은 재료 ${r.unpricedInPlan.length}종(${esc(r.unpricedInPlan.slice(0, 6).join(', '))}${r.unpricedInPlan.length > 6 ? ' 등' : ''})은 비용에서 빠져 있어서, 실제 비용은 이보다 큽니다. 아래 "재료 시세"에서 가격을 넣으면 정확해져요.</p>` : ''}`;
    $('#planTable').innerHTML = `<thead><tr><th class="num">순서</th><th>방법</th><th>오르는 스탯</th><th class="num">비용</th><th class="num">부족분 1%당</th></tr></thead>
      <tbody>${r.plan.map((p, i) => planRow(p, i)).join('') || `<tr><td colspan="5" class="muted">계산할 수 있는 방법이 없습니다. 장비 진행 상황과 재료 시세를 확인해 주세요.</td></tr>`}</tbody>`;    renderShopping(r.plan);
  }

  $('#unresolved').innerHTML = r.unresolved.length ? `<div class="box bad"><h4>아직 남는 부족분</h4><ul>${r.unresolved.map((u) =>
    `<li>${esc(S.meta.statLabels[u.stat])} ${fmt(u.gap)}</li>`).join('')}</ul>
    <p class="hint">켜 둔 방법을 모두 최대로 해도 모자랍니다. 시세가 없어 빠진 방법(아래)에 가격을 넣거나, 정령석·아바타·버프 등 이 계산에 없는 수단을 고려하세요.</p></div>` : '';

  // 시세가 없어 빠진 후보
  if (r.blocked.length) {
    const missing = [...new Set(r.blocked.flatMap((b) => b.missing))];
    $('#blocked').innerHTML = `<div class="box"><h4>시세를 몰라 비교에서 뒤로 밀린 방법</h4>
      <p class="hint" style="margin-top:0">${r.blocked.map((b) => esc(b.name)).join(', ')}</p>
      <p class="hint">아래 재료에 가격을 넣으면 바로 다시 계산합니다. 귀속 재료라면 주간 보상·인장으로 얻는 데 드는 노력을 골드로 환산해 넣거나, 이미 있으면 0을 넣으세요.</p>
      ${missing.map((n) => `<div class="pi"><span>${esc(n)}</span><input type="number" min="0" data-price="${esc(n)}" value="${S.overrides[n] ?? ''}" placeholder="골드" aria-label="${esc(n)} 가격"></div>`).join('')}
    </div>`;
    $('#blocked').querySelectorAll('[data-price]').forEach((inp) => inp.addEventListener('change', () => setOverride(inp.dataset.price, inp.value)));
  } else $('#blocked').innerHTML = '';

  // 스탯별 순위
  const keys = Object.keys(r.perStat);
  if (!keys.includes(S.statTab)) S.statTab = keys[0] || null;
  $('#perStatTabs').innerHTML = keys.map((k) => `<button role="tab" aria-selected="${k === S.statTab}" data-tab="${k}">${esc(S.meta.statLabels[k])}</button>`).join('');
  $('#perStatTabs').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { S.statTab = b.dataset.tab; renderResult(S.lastResult, d); }));
  const rows = S.statTab ? r.perStat[S.statTab] : [];
  $('#perStatTable').innerHTML = S.statTab ? `<thead><tr><th>방법</th><th>다음 단계</th><th class="num">오르는 양</th><th class="num">1포인트당 골드</th></tr></thead>
    <tbody>${rows.map((x) => `<tr>
      <td><span class="aname">${esc(x.name)}</span>${x.risky ? ' <span class="tag risk">확률 미반영</span>' : ''}${x.requires ? `<div class="muted">${esc(x.requires)}</div>` : ''}</td>
      <td>${esc(x.stepLabel)}${x.attempts > 1.001 ? `<div class="muted">기대 ${x.attempts.toFixed(2)}회 시도</div>` : ''}</td>
      <td class="num">+${fmt(x.gain)}</td>
      <td class="num"><span class="gold">${fmtGold(x.costPerPoint)}</span>${x.partial ? `<div class="muted">+ 시세 없는 재료 ${x.missing.length}종</div>` : ''}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="muted">이 스탯을 올릴 수 있는 방법이 남아 있지 않습니다.</td></tr>'}</tbody>` : '';
  $('#perStatTabs').hidden = !keys.length;
}

// 계획 전체에 필요한 재료 합계 (시세와 관계없이 '무엇을 몇 개 모아야 하는지')
function renderShopping(plan) {
  if (!plan.length) { $('#shopping').innerHTML = ''; return; }
  let gold = 0;
  const mats = {};
  for (const p of plan) {
    gold += p.goldDirect || 0;
    for (const [n, m] of Object.entries(p.materials)) mats[n] = (mats[n] || 0) + m.qty;
  }
  const rows = Object.entries(mats).sort((a, b) => b[1] - a[1]);
  const q = (v) => (v % 1 ? `약 ${Math.ceil(v).toLocaleString('ko-KR')}` : v.toLocaleString('ko-KR'));
  $('#shopping').innerHTML = `<div class="box shopping"><h4>이 순서대로 하려면 모아야 할 것</h4>
    <p class="hint" style="margin-top:0">강화처럼 확률이 있는 단계는 기대 시도 횟수만큼 곱한 값이라, 운에 따라 더 적게 들 수도 있어요.</p>
    <ul class="shop-list"><li><span>골드 (연마·강화·승급 비용)</span><b class="gold">${fmtGold(gold)}</b></li>
    ${rows.map(([n, v]) => `<li><span>${esc(n)}</span><b>${q(v)}개</b></li>`).join('')}</ul></div>`;
}

function planRow(p, i) {
  const range = p.count > 1 ? `${p.fromLabel} ~ ${p.toLabel} (${p.count}단계)` : p.fromLabel;
  const mats = Object.entries(p.materials).map(([n, m]) =>
    `<li>${esc(n)} ${m.qty % 1 ? m.qty.toFixed(1) : fmt(m.qty)}개 × ${m.unit == null ? '?' : fmt(m.unit)}</li>`).join('');
  return `<tr>
    <td class="num">${i + 1}</td>
    <td><span class="tag">${esc(p.group)}</span>${p.risky ? '<span class="tag risk">확률 미반영</span>' : ''}${p.missing?.length ? '<span class="tag risk">시세 일부 없음</span>' : ''}<span class="aname">${esc(p.name)}</span>
      <div class="muted">${esc(range)}</div>
      ${p.requires ? `<div class="muted">${esc(p.requires)}</div>` : ''}
      <details><summary>재료 보기</summary><ul class="mats"><li>골드 ${fmt(p.goldDirect)}</li>${mats}</ul>
      <a class="muted" href="${esc(p.source)}" target="_blank" rel="noopener">수치 출처</a></details></td>
    <td>${esc(gainText(p.gain))}</td>
    <td class="num gold">${fmtGold(p.cost)}</td>
    <td class="num">${p.avgEff == null ? '-' : fmtGold(p.avgEff)}</td>
  </tr>`;
}

// ───────────── 시작 ─────────────
(async function init() {
  try {
    const [meta, dungeons, catalog] = await Promise.all([api('/api/meta'), api('/api/dungeons'), api('/api/catalog')]);
    S.meta = meta;
    S.dungeons = dungeons;
    S.catalog = catalog;
    S.disabled = store.get('hs.disabled', catalog.filter((a) => a.defaultOff).map((a) => a.id));
    $('#mockBanner').hidden = !meta.mock;
    $('#dataDate').textContent = meta.dungeonsUpdated;
    $('#lucky').value = S.lucky;
    if (window.matchMedia('(max-width: 900px)').matches) $('#gearPanel').open = false;
    renderStatForm();
    renderGear();
    renderLadder();
    api('/api/prices').then((p) => {
      S.prices = p.prices;
      renderPrices();
      if (!p.mock && p.found === 0) {
        document.querySelector('.main').insertAdjacentHTML('afterbegin', `<p class="warn">거래소 시세를 하나도 불러오지 못했어요${p.firstError ? ` (${esc(p.firstError)})` : ''}. 성장 순서는 골드 비용만으로 비교합니다. <a href="/api/debug/auction" target="_blank" rel="noopener">거래소 응답 확인</a> 결과를 개발자에게 알려 주세요.</p>`);
      } else if (!p.mock && p.found < p.total) {
        $('#pricesBox summary .sub').textContent = `재료 ${p.total}종 중 ${p.found}종 시세 확인, 나머지는 직접 입력할 수 있어요`;
      }
    }).catch(() => {});
    if (S.dungeonId) runAdvise();
  } catch (err) {
    document.querySelector('.main').insertAdjacentHTML('afterbegin', `<p class="warn">서버에 연결하지 못했습니다: ${esc(err.message)}. 서버가 실행 중인지 확인해 주세요.</p>`);
  }
})();
