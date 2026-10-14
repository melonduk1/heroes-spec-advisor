// 캐릭터 비교 탭 — app.js 의 $, fmt, esc, store, api, S, SHORT_STAT 를 함께 쓴다

// ───────────── 탭 전환 (#compare 로 바로 열 수 있게) ─────────────
function showView(view) {
  const isCmp = view === 'compare';
  $('#viewAdvisor').hidden = isCmp;
  $('#viewCompare').hidden = !isCmp;
  document.querySelectorAll('.tabs-top [data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === view)));
  const hash = isCmp ? '#compare' : '';
  if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname);
}
document.querySelectorAll('.tabs-top [data-view]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
showView(location.hash === '#compare' ? 'compare' : 'advisor');

// ───────────── 비교 ─────────────
const CMP_SLOTS = [
  ['Right Hand', '무기'], ['Left Hand', '보조'], ['Head', '머리'], ['Upper', '가슴'], ['Lower', '다리'], ['Hand', '손'], ['Leg', '발'],
  ['Rhod', '로드'], ['Right Finger', '반지'], ['Left Finger', '반지'], ['Earring', '귀걸이'], ['Belt', '벨트'], ['Charm', '브로치'],
  ['Necklace', '목걸이'], ['Artifact', '아티팩트'], ['Right Wrist', '팔찌'], ['Left Wrist', '팔찌'],
];

const saved = store.get('hs.compare', {});
if (saved.a) $('#cmpA').value = saved.a;
if (saved.b) $('#cmpB').value = saved.b;

async function ensureMeta() {
  if (!S.meta) S.meta = await api('/api/meta');
  if (!S.dungeons?.length) S.dungeons = await api('/api/dungeons');
}

$('#compareForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const a = $('#cmpA').value.trim();
  const b = $('#cmpB').value.trim();
  store.set('hs.compare', { a, b });
  const msg = $('#cmpMsg');
  msg.className = 'msg';
  msg.textContent = '두 캐릭터를 불러오는 중…';
  try {
    await ensureMeta();
    const [ra, rb] = await Promise.allSettled([a, b].map((n) => api(`/api/character?name=${encodeURIComponent(n)}`)));
    const fail = [[a, ra], [b, rb]].filter(([, r]) => r.status === 'rejected');
    if (fail.length) {
      msg.className = 'msg err';
      msg.textContent = fail.map(([n, r]) => `${n}: ${r.reason.message}`).join(' / ');
      return;
    }
    const A = ra.value; const B = rb.value;
    msg.textContent = A.mock || B.mock ? '목업 모드라 두 캐릭터 모두 예시 스탯이 나와요. 실제 비교는 API 키가 있는 서버에서 해 주세요.' : '';
    renderCompare(A, B);
  } catch (err) {
    msg.className = 'msg err';
    msg.textContent = err.message;
  }
});

const cls = (x, y, higherBetter = true) => (x == null || y == null || x === y ? '' : (x > y) === higherBetter ? 'win' : 'lose');
const diffTxt = (x, y) => {
  if (x == null || y == null) return '-';
  const d = y - x;
  return d === 0 ? '같음' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`;
};

function renderCompare(A, B) {
  $('#cmpResult').hidden = false;
  const head = (r, tag) => `<div class="cmp-head">
    <span class="cmp-tag">${tag}</span>
    <span class="cname">${esc(r.name)}</span>
    ${r.className ? `<span class="cclass">${esc(r.className)}</span>` : ''}
    ${r.basic?.character_level ? `<span class="clv">${esc(r.basic.character_level)}레벨</span>` : ''}
    ${r.attackType ? `<span class="ctype">${r.attackType === 'magic' ? '마법 공격력' : '물리 공격력'} 캐릭터</span>` : ''}
  </div>`;
  $('#cmpHeads').innerHTML = head(A, 'A') + head(B, 'B');

  // 스탯: 주 공격력(캐릭터가 쓰는 쪽) + 나머지
  const L = S.meta.statLabels;
  const rows = [
    ['주 공격력', A.stats.atk, B.stats.atk, `A는 ${A.attackType === 'magic' ? '마법 공격력' : '공격력'}, B는 ${B.attackType === 'magic' ? '마법 공격력' : '공격력'} 기준`],
    ['공격력', A.attack?.atk, B.attack?.atk],
    ['마법 공격력', A.attack?.matk, B.attack?.matk],
    ...S.meta.statKeys.filter((k) => k !== 'atk').map((k) => [L[k], A.stats[k], B.stats[k]]),
  ];
  $('#cmpStats').innerHTML = `<thead><tr><th>스탯</th><th class="num">A ${esc(A.name)}</th><th class="num">B ${esc(B.name)}</th><th class="num">차이 (B − A)</th></tr></thead>
    <tbody>${rows.map(([label, x, y, note]) => `<tr>
      <td>${esc(label)}${note ? `<div class="muted">${esc(note)}</div>` : ''}</td>
      <td class="num ${cls(x, y)}">${fmt(x)}</td>
      <td class="num ${cls(y, x)}">${fmt(y)}</td>
      <td class="num">${diffTxt(x, y)}</td>
    </tr>`).join('')}</tbody>`;

  // 던전: 입장 가능 여부 + 상한
  const status = (r, d) => {
    const short = Object.entries(d.minStats).filter(([k, v]) => Number.isFinite(r.stats[k]) && r.stats[k] < v);
    const unknown = Object.keys(d.minStats).filter((k) => !Number.isFinite(r.stats[k]));
    const entry = short.length
      ? `<span class="cap-short">${short.length}개 부족</span><div class="muted">${short.map(([k, v]) => `${esc(L[k].replace(/\(.*\)/, ''))} −${fmt(v - r.stats[k])}`).join(', ')}</div>`
      : unknown.length ? '<span class="muted">스탯 일부 없음</span>' : '<span class="cap-ok">입장 가능</span>';
    const caps = Object.entries(d.capStats || {}).map(([k, v]) => {
      const have = r.stats[k];
      if (!Number.isFinite(have)) return '';
      const name = { atk: '공상', crit: '만크', bal: '만밸' }[k];
      return have >= v ? `<span class="cap-ok">${name} ✓</span>` : `<span class="cap-short">${name} −${fmt(v - have)}</span>`;
    }).filter(Boolean).join(' ');
    return { html: `${entry}${caps ? `<div class="caps-line">${caps}</div>` : ''}`, pass: !short.length && !unknown.length, shortCount: short.length };
  };
  const list = [...S.dungeons].sort((x, y) => x.minStats.atk - y.minStats.atk);
  $('#cmpDungeons').innerHTML = `<thead><tr><th>던전</th><th>A ${esc(A.name)}</th><th>B ${esc(B.name)}</th></tr></thead>
    <tbody>${list.map((d) => {
      const sa = status(A, d); const sb = status(B, d);
      return `<tr><td><span class="aname">${esc(d.name)}</span><div class="muted">${esc([d.category, d.boss].filter(Boolean).join(', '))}</div></td>
        <td class="${sa.pass && !sb.pass ? 'win' : ''}">${sa.html}</td>
        <td class="${sb.pass && !sa.pass ? 'win' : ''}">${sb.html}</td></tr>`;
    }).join('')}</tbody>`;

  // 장비: 같은 부위끼리
  const items = (r) => {
    const m = {};
    for (const it of r.equipment?.items || []) m[it.slot] = it;
    return m;
  };
  const ia = items(A); const ib = items(B);
  const cell = (it) => {
    if (!it) return '<span class="muted">-</span>';
    const tune = Object.entries(it.tuning || {}).filter(([, v]) => v).map(([n, v]) => `${SHORT_STAT[n] || n.replace('공격력 제한 해제', '파괴')} ${fmt(v)}`).join(', ');
    const ench = [it.prefix, it.suffix].filter(Boolean).join(' · ');
    return `<div class="aname">${esc(it.name)}${it.enhancement ? ` <span class="enh">+${esc(it.enhancement)}</span>` : ''}</div>
      ${ench ? `<div>인챈트: ${esc(ench)}</div>` : '<div class="muted">인챈트 없음</div>'}
      ${it.infusion ? `<div>정령: ${esc(SHORT_STAT[it.infusion.name] || it.infusion.name)} ${it.infusion.value > 0 ? '+' : ''}${fmt(it.infusion.value)}</div>` : ''}
      ${tune ? `<div class="muted">연마: ${esc(tune)}</div>` : ''}`;
  };
  const noEq = !A.equipment && !B.equipment;
  $('#cmpEquip').innerHTML = noEq
    ? '<tbody><tr><td class="muted">장비 정보를 불러오지 못했어요.</td></tr></tbody>'
    : `<thead><tr><th>부위</th><th>A ${esc(A.name)}</th><th>B ${esc(B.name)}</th></tr></thead>
      <tbody>${CMP_SLOTS.filter(([s]) => ia[s] || ib[s]).map(([s, label]) => {
        return `<tr><td class="eslot">${esc(label)}</td><td>${cell(ia[s])}</td><td>${cell(ib[s])}</td></tr>`;
      }).join('')}</tbody>`;
}
