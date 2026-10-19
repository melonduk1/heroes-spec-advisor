// 캐릭터 정보 탭 — 프로필·능력치·타이틀·장비·각성
// app.js 의 $, fmt, esc, store, api, S, SHORT_STAT 를 함께 쓴다

const GRADE_OF = [['전설', 'legend'], ['레어', 'rare'], ['고급', 'high'], ['중급', 'mid'], ['초급', 'low'], ['일반', 'basic']];
const SLOT_INFO = {
  'Right Hand': ['무기', '武'], 'Left Hand': ['보조', '補'], Head: ['머리', '頭'], Upper: ['가슴', '胸'], Lower: ['다리', '脚'],
  Hand: ['손', '手'], Leg: ['발', '足'], Rhod: ['로드', '杖'], 'Right Finger': ['반지', '環'], 'Left Finger': ['반지', '環'],
  Earring: ['귀걸이', '珥'], Belt: ['벨트', '帶'], Charm: ['브로치', '飾'], Necklace: ['목걸이', '頸'], Artifact: ['아티팩트', '遺'],
  'Right Wrist': ['팔찌', '釧'], 'Left Wrist': ['팔찌', '釧'],
};
// 화면 배치: 방어구 → 무기 → 장신구 순
const SHEET_ORDER = ['Right Hand', 'Left Hand', 'Head', 'Upper', 'Lower', 'Hand', 'Leg', 'Rhod', 'Artifact',
  'Right Finger', 'Left Finger', 'Earring', 'Necklace', 'Belt', 'Charm', 'Right Wrist', 'Left Wrist'];
const MAIN_STATS = ['공격력', '마법 공격력', '마법공격력', '방어력', '크리티컬', '밸런스', '추가피해', '파괴력', '방어력 관통', '공격속도'];

function gradeOf(name) {
  for (const [ko, key] of GRADE_OF) if (name.startsWith(`${ko} `)) return { ko, key };
  if (/완전한/.test(name)) return { ko: '완전', key: 'rare' };
  return null;
}

function tuningLines(t) {
  return Object.entries(t || {}).filter(([, v]) => v).map(([n, v]) => {
    const label = n === '공격력 제한 해제' ? '파괴력' : n;
    return `<li class="tl">${esc(label)} <b>+${fmt(v)}</b></li>`;
  }).join('');
}

function itemCard(it) {
  if (!it) return '';
  const [slotKo, glyph] = SLOT_INFO[it.slot] || [it.slot, '·'];
  const g = gradeOf(it.name);
  const ench = [it.prefix, it.suffix].filter(Boolean).join(' ');
  const inf = it.infusion ? `<li class="inf">${esc(it.infusion.name)} <b>${it.infusion.value > 0 ? '+' : ''}${fmt(it.infusion.value)}</b></li>` : '';
  return `<article class="item g-${g ? g.key : 'none'}">
    <div class="glyph" aria-hidden="true">${glyph}</div>
    <div class="ibody">
      <div class="itop"><span class="ench">${esc(ench)}</span>${g ? `<span class="gbadge">${esc(g.ko)}</span>` : ''}</div>
      <h4>${it.enhancement ? `<span class="plus">+${esc(it.enhancement)}</span> ` : ''}${esc(it.name)}</h4>
      <p class="islot">${esc(slotKo)}</p>
      ${inf || tuningLines(it.tuning) ? `<ul class="ilines">${inf}${tuningLines(it.tuning)}</ul>` : ''}
    </div>
  </article>`;
}

function statRows(list) {
  return list.map((x) => `<div class="srow"><dt>${esc(x.name)}</dt><dd>${fmt(x.value)}</dd></div>`).join('');
}

function renderCharSheet(r) {
  const box = $('#charSheet');
  if (!box || !r) return;
  const b = r.basic || {};
  const created = b.character_date_create ? new Date(b.character_date_create) : null;
  const dateTxt = created && !Number.isNaN(+created)
    ? created.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '-';

  // 능력치: API 전체 목록이 있으면 그걸, 없으면 진단용 스탯으로
  let list = r.statList?.length ? r.statList : Object.entries(r.stats || {}).map(([k, v]) => ({ name: S.meta?.statLabels?.[k] || k, value: v }));
  // 캐릭터가 쓰지 않는 쪽 공격력은 기타로 내린다
  const unusedAtk = r.attackType === 'magic' ? ['공격력'] : r.attackType === 'physical' ? ['마법 공격력', '마법공격력'] : [];
  const main = MAIN_STATS.flatMap((n) => list.filter((x) => x.name === n && !unusedAtk.includes(n)));
  const rest = list.filter((x) => !main.includes(x));

  const items = new Map((r.equipment?.items || []).map((i) => [i.slot, i]));
  const ordered = SHEET_ORDER.map((s) => items.get(s)).filter(Boolean);

  const titles = b.title_stat || [];
  const awaken = b.skill_awakening || [];
  const dress = b.dress_point;

  box.hidden = false;
  box.innerHTML = `
  <aside class="cs-side">
    <section class="cs-card profile">
      <div class="crest" aria-hidden="true">${esc((r.className || r.name || '?').slice(0, 1))}</div>
      <div class="pid">
        ${r.className ? `<span class="pclass">${esc(r.className)}</span>` : ''}
        <h2>${esc(r.name)}</h2>
        ${r.attackType ? `<span class="ptype">${r.attackType === 'magic' ? '마법 공격력' : '물리 공격력'}</span>` : ''}
      </div>
      <dl class="pgrid">
        <div><dt>레벨</dt><dd>${esc(b.character_level ?? '-')}</dd></div>
        <div><dt>카르제</dt><dd>${esc(b.cairde_name || '-')}</dd></div>
        <div><dt>타이틀</dt><dd>${fmt(b.total_title_count ?? b.title_count)}<small>개</small></dd></div>
        <div><dt>생성일</dt><dd>${esc(dateTxt)}</dd></div>
      </dl>
      <div class="pactions">
        <button type="button" class="ghost" data-act="advise">스펙 진단하기</button>
        <button type="button" class="ghost" data-act="compare">비교에 넣기</button>
      </div>
    </section>

    <section class="cs-card">
      <h3>능력치</h3>
      <dl class="sgrid sg-main">${statRows(main)}</dl>
      ${rest.length ? `<details class="more"><summary>기타 능력치 ${rest.length}개</summary><dl class="sgrid">${statRows(rest)}</dl></details>` : ''}
    </section>

    ${titles.length ? `<section class="cs-card">
      <h3>타이틀 효과 <span class="count">${fmt(b.total_title_count ?? b.title_count)}개</span></h3>
      <dl class="sgrid">${titles.map((t) => `<div class="srow"><dt>${esc(t.stat_name)}</dt><dd>+${fmt(Number(t.stat_value))}</dd></div>`).join('')}</dl>
    </section>` : ''}
  </aside>

  <section class="cs-main">
    <div class="cs-tabs" role="tablist">
      <button role="tab" aria-selected="true" data-pane="gear">장비 <span>${ordered.length}</span></button>
      ${awaken.length ? `<button role="tab" aria-selected="false" data-pane="awaken">스킬 각성 <span>${awaken.length}</span></button>` : ''}
      ${dress ? `<button role="tab" aria-selected="false" data-pane="dress">아바타</button>` : ''}
    </div>
    <div class="pane" data-pane="gear">
      ${ordered.length ? `<div class="items">${ordered.map(itemCard).join('')}</div>` : '<p class="hint">장비 정보를 불러오지 못했어요.</p>'}
    </div>
    ${awaken.length ? `<div class="pane" data-pane="awaken" hidden>
      <ul class="awaken">${awaken.map((a) => {
        const m = String(a.item_name).match(/(\d+)%/);
        return `<li><span class="aw-skill">${esc(a.skill_name)}</span><span class="aw-stone">${esc(String(a.item_name).replace('각성의 돌: ', ''))}</span>${m ? `<span class="aw-bar" style="--w:${Math.min(100, Number(m[1]) * 8)}%"></span>` : ''}</li>`;
      }).join('')}</ul>
    </div>` : ''}
    ${dress ? `<div class="pane" data-pane="dress" hidden>
      <dl class="dress">
        <div class="total"><dt>의상 점수</dt><dd>${fmt(dress.total_point)}</dd></div>
        <div><dt>아바타</dt><dd>${fmt(dress.avatar_point)}</dd></div>
        <div><dt>등 장식</dt><dd>${fmt(dress.back_point)}</dd></div>
        <div><dt>꼬리</dt><dd>${fmt(dress.tail_point)}</dd></div>
        <div><dt>오브젝트</dt><dd>${fmt(dress.object_point)}</dd></div>
      </dl>
    </div>` : ''}
  </section>`;

  box.querySelectorAll('.cs-tabs [data-pane]').forEach((t) => t.addEventListener('click', () => {
    box.querySelectorAll('.cs-tabs [data-pane]').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
    box.querySelectorAll('.pane').forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.pane; });
  }));
  box.querySelector('[data-act=advise]').addEventListener('click', () => {
    $('#charName').value = r.name;
    showView('advisor');
    $('#lookupForm').requestSubmit();
  });
  box.querySelector('[data-act=compare]').addEventListener('click', () => {
    const a = $('#cmpA');
    if (!a.value || a.value === r.name) a.value = r.name; else $('#cmpB').value = r.name;
    showView('compare');
  });
}

$('#charForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#charQ').value.trim();
  const msg = $('#charMsg');
  msg.className = 'msg';
  msg.textContent = '불러오는 중…';
  try {
    if (!S.meta) S.meta = await api('/api/meta');
    const r = await api(`/api/character?name=${encodeURIComponent(name)}`);
    store.set('hs.charQ', name);
    msg.textContent = r.mock ? '목업 모드라 예시 데이터가 보여요.' : '';
    renderCharSheet(r);
  } catch (err) {
    msg.className = 'msg err';
    msg.textContent = err.message;
  }
});

// 스펙 진단 탭에서 불러온 캐릭터도 이 화면에 보여준다
window.renderCharSheet = renderCharSheet;
const lastQ = store.get('hs.charQ', '');
if (lastQ) $('#charQ').value = lastQ;
