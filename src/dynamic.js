// 캐릭터 장비에 따라 달라지는 성장 방법
//   - 정령석: 지금 붙은 정령 능력치를 크리티컬/밸런스 +2로 바꾸기 (확률)
//   - 인챈트 교체: 지금 인챈트 → 더 좋은 인챈트 (차이만큼만 오름)
//   - 군주의 흑요석 팔찌: 완전한 등급까지 마력 주입
//
// 출처
//   정령 합성 확률: https://heroes.nexon.com/Common/NoticePopup?no=27
//   인챈트 수치: 각 레이드 패치노트, 나무위키 '마비노기 영웅전/인챈트/접두'
//   팔찌: https://heroes.nexon.com/news/update/View?postno=1199

const SRC_SPIRIT = 'https://heroes.nexon.com/Common/NoticePopup?no=27';
const SRC_BRACELET = 'https://heroes.nexon.com/news/update/View?postno=1199';
const SRC_ENCHANT = 'https://namu.wiki/w/%EB%A7%88%EB%B9%84%EB%85%B8%EA%B8%B0%20%EC%98%81%EC%9B%85%EC%A0%84/%EC%9D%B8%EC%B1%88%ED%8A%B8/%EC%A0%91%EB%91%90';

// ───────── 정령석 ─────────
// 장비 종류(와 기본 능력치에 크리티컬·밸런스가 있는지)에 따라 '크리티컬 증가'/'밸런스 증가'가 뽑힐 확률
// 뽑혔을 때 +2 이상일 확률 = 95.67% + 1.51%
const P_TWO_OR_MORE = 0.9567 + 0.0151;
const SPIRIT_TABLE = [
  // match: 장비 이름 조건, slot: 장비 슬롯, level: 정령석 등급 결정용
  { slots: ['Right Hand'], match: (n) => n.includes('에리우'), crit: 0.03, bal: 0.03, level: 125, label: '무기' },
  { slots: ['Left Hand'], match: (n) => n.includes('에리우'), crit: 0.04, bal: 0.005, level: 125, label: '보조 장비' },
  { slots: ['Right Finger', 'Left Finger'], match: (n) => n === '필멸의 굴레', crit: 0.04, bal: 0.04, level: 125, label: '반지' },
  { slots: ['Right Finger', 'Left Finger'], match: (n) => n === '고요의 증표' || n === '침묵의 증표', crit: 0.04, bal: 0.04, level: 120, label: '반지' },
  { slots: ['Earring'], match: (n) => n === '풍요의 근본', crit: 0.04, bal: 0.005, level: 125, label: '귀걸이' },
  { slots: ['Belt'], match: (n) => n === '스타라이트 벨트', crit: 0.005, bal: 0.04, level: 125, label: '벨트' },
];

const INFUSION_STAT = { '크리티컬': 'crit', '밸런스': 'bal', '공격력': 'atk', '마법공격력': 'atk', '마법 공격력': 'atk', '방어력': 'def' };

function spiritActions(items) {
  const out = [];
  for (const it of items) {
    const row = SPIRIT_TABLE.find((r) => r.slots.includes(it.slot) && r.match(it.name));
    if (!row) continue;
    const cur = it.infusion;
    const curKey = cur ? INFUSION_STAT[cur.name] : null;
    for (const target of ['crit', 'bal']) {
      const p = row[target] * P_TWO_OR_MORE;
      if (!(p > 0)) continue;
      if (curKey === target && cur.value >= 2) continue; // 이미 +2 이상
      const gain = { [target]: 2 - (curKey === target ? cur.value : 0) };
      if (curKey && curKey !== target && cur.value > 0) gain[curKey] = -cur.value; // 기존 정령 능력치는 사라짐
      const stone = row.level >= 125 ? '고급 정령석' : '중급 정령석';
      const tName = target === 'crit' ? '크리티컬' : '밸런스';
      out.push({
        id: `spirit-${target}-${it.slot.replace(/\s/g, '')}`,
        type: 'sequence', group: '정령석', target: `${row.label} (${it.name})`, dynamic: true,
        name: `${it.name} 정령 합성 → ${tName} +2`,
        steps: [{ label: cur ? `${cur.name} ${cur.value > 0 ? '+' : ''}${cur.value} → ${tName} +2` : `${tName} +2`, gain, rate: p, pity: [], cost: { gold: 0, items: { [stone]: 1 } } }],
        note: `한 번 합성할 때 ${tName} +2 이상이 나올 확률 ${(p * 100).toFixed(2)}% → 평균 ${Math.round(1 / p)}회. 합성할 때마다 기존 정령 능력치는 바뀝니다.`,
        source: SRC_SPIRIT,
      });
    }
  }
  return out;
}

// ───────── 인챈트 ─────────
// 인챈트의 '크리티컬 N%'·'밸런스 N%'는 실제로는 크리티컬/밸런스 +N (고정 수치).
// 크리티컬 저항·공격속도·생명력·스태미나는 입장 조건이 아니라 계산에서 제외.
const ENCHANTS = {
  prefix: {
    '비극의': { atk: 700, crit: 8, bal: 4 },
    '잔혹한': { atk: 430, crit: 4, bal: 2 },
    '가득한': { atk: 245, def: 200, crit: 3, bal: 6 },
    '냉철의': { atk: 245, def: 200, crit: 3, bal: 3 },
    '영원한': { def: 160, crit: 9, bal: -3 },
    '고결한': { def: 160, crit: 6, bal: -3 },
    '물드는': { atk: 145, def: 300, crit: 6, bal: 7 },
    '공허한': { def: 1000, crit: 4 },
    '헤매는': { bal: 12 },
    '대적자의': { bal: 9 }, // 반지 접두 4랭크 (크리티컬 저항 5, 생명력 -450은 계산 제외)
    '메마른': { crit: 6, bal: 4 },
    '초월의': { atk: 600, crit: 2, bal: 2, addDmg: 150 },
    '처단하는': { atk: 700, crit: 2, bal: 2, addDmg: 50 },
    '고조되는': { atk: 700, crit: 2, bal: 2, addDmg: 50 },
    '순환의': { atk: 700, crit: 2, bal: 2, addDmg: 50 },
    '증폭된': { atk: 700, crit: 2, bal: 2, addDmg: 50 },
    '불굴의': { atk: 700, crit: 2, bal: 2, addDmg: 50 },
    '감춰진': { atk: 700 },
    '질풍의': { atk: 700, crit: -4, bal: -4 },
  },
  suffix: {
    '강림': { atk: 450, crit: 2, bal: 2 },
    '운명': { atk: 400, crit: 4, bal: 4 },
    '신비': { atk: 200, crit: 2, bal: 2 }, // 반지·벨트 접미 5랭크
    '고독': { atk: 465, def: -300, bal: 10 },
    '시련': { def: 120, crit: 12, bal: -1 },
  },
};

// 슬롯별로 추천할 인챈트 (해당 부위에 붙는 것 중 고정 수치가 높은 것)
const ENCHANT_TARGETS = [
  { slots: ['Right Hand'], kind: 'prefix', to: '비극의', label: '무기' },
  { slots: ['Head', 'Lower'], kind: 'prefix', to: '가득한', label: '머리/다리' },
  { slots: ['Upper'], kind: 'prefix', to: '영원한', label: '가슴' },
  { slots: ['Upper'], kind: 'suffix', to: '시련', label: '가슴' },
  { slots: ['Hand', 'Leg'], kind: 'prefix', to: '물드는', label: '손/발' },
  { slots: ['Hand', 'Leg'], kind: 'suffix', to: '고독', label: '손/발' },
  { slots: ['Left Hand'], kind: 'prefix', to: '공허한', label: '보조 장비' },
  { slots: ['Right Finger', 'Left Finger'], kind: 'prefix', to: '헤매는', label: '반지' },
  { slots: ['Right Finger', 'Left Finger', 'Belt'], kind: 'suffix', to: '운명', label: '반지/벨트' },
  { slots: ['Belt'], kind: 'prefix', to: '메마른', label: '벨트' },
  { slots: ['Charm'], kind: 'prefix', to: '초월의', label: '브로치' },
  { slots: ['Artifact'], kind: 'suffix', to: '강림', label: '아티팩트' },
];

const scrollName = (kind, name) => `${name} 인챈트 스크롤`;

function enchantActions(items) {
  const out = [];
  for (const t of ENCHANT_TARGETS) {
    for (const it of items.filter((x) => t.slots.includes(x.slot))) {
      const cur = it[t.kind];
      if (cur === t.to) continue;
      const curStats = cur ? ENCHANTS[t.kind][cur] : {};
      const to = ENCHANTS[t.kind][t.to];
      const known = !cur || curStats !== undefined;
      const gain = {};
      for (const k of new Set([...Object.keys(to), ...Object.keys(curStats || {})])) {
        const d = (to[k] || 0) - ((curStats || {})[k] || 0);
        if (d) gain[k] = d;
      }
      if (known && !Object.values(gain).some((v) => v > 0)) continue; // 바꿔도 이득 없음
      out.push({
        id: `enchant-swap-${t.kind}-${it.slot.replace(/\s/g, '')}`,
        type: 'once', group: '인챈트', target: `${t.label} (${it.name})`, dynamic: true,
        name: `${it.name} ${t.kind === 'prefix' ? '접두' : '접미'} ${cur || '없음'} → ${t.to}`,
        gain: known ? gain : to,
        cost: { gold: 0, items: { [scrollName(t.kind, t.to)]: 1 } },
        risky: true,
        defaultOff: !known,
        note: known
          ? '지금 인챈트와의 차이만큼만 계산했어요. 인챈트 성공 확률과 실패 시 파괴 위험은 계산에 없습니다.'
          : `지금 붙은 '${cur}' 인챈트의 수치를 몰라 새 인챈트 수치를 그대로 더했어요(실제로는 이보다 적게 오름). 그래서 기본으로 꺼 둡니다.`,
        source: SRC_ENCHANT,
      });
    }
  }
  return out;
}

// ───────── 군주의 흑요석 팔찌 ─────────
const BRACELETS = [
  { name: '군주의 녹슨 흑요석 팔찌', atk: 500, crit: 1, destruction: 0, mana: 13 },
  { name: '군주의 흑요석 팔찌', atk: 500, crit: 3, destruction: 0, mana: 10 },
  { name: '군주의 빛나는 흑요석 팔찌', atk: 1000, crit: 3, destruction: 200, mana: 8 },
  { name: '군주의 완전한 흑요석 팔찌', atk: 1000, crit: 5, destruction: 400, mana: 0 },
];

function braceletActions(items) {
  const top = BRACELETS[BRACELETS.length - 1];
  return items.filter((it) => /Wrist/.test(it.slot)).map((it) => {
    const cur = BRACELETS.find((b) => b.name === it.name);
    if (!cur || cur.mana === 0) return null;
    return {
      id: `bracelet-${it.slot.replace(/\s/g, '')}`,
      type: 'sequence', group: '팔찌', target: `팔찌 (${it.name})`, dynamic: true,
      name: `${it.name} → 완전한 등급 (마력 주입)`,
      steps: [{ label: '마력 주입', rate: 1, pity: [], gain: { atk: top.atk - cur.atk, crit: top.crit - cur.crit, destruction: top.destruction - cur.destruction }, cost: { gold: 0, items: { '마력: 찬탈자의 왕좌': cur.mana } } }],
      note: `마력 1개 = 시공의 편린: 찬탈자의 왕좌 10개 (왕좌 1회 완수당 편린 3개). 거래소에서 살 수 없어 골드 비용이 없습니다.`,
      source: SRC_BRACELET,
    };
  }).filter(Boolean);
}

function buildDynamicActions(items) {
  if (!Array.isArray(items) || !items.length) return [];
  const clean = items
    .filter((x) => x && typeof x.slot === 'string' && typeof x.name === 'string')
    .map((x) => ({
      slot: x.slot, name: x.name,
      prefix: typeof x.prefix === 'string' ? x.prefix : null,
      suffix: typeof x.suffix === 'string' ? x.suffix : null,
      infusion: x.infusion && typeof x.infusion.name === 'string' ? { name: x.infusion.name, value: Number(x.infusion.value) || 0 } : null,
    }));
  return [...spiritActions(clean), ...enchantActions(clean), ...braceletActions(clean)];
}

// 시세 조회 대상 (정령석·인챈트 스크롤)
const DYNAMIC_ITEMS = [
  '고급 정령석', '중급 정령석',
  ...ENCHANT_TARGETS.map((t) => scrollName(t.kind, t.to)),
];

module.exports = { buildDynamicActions, DYNAMIC_ITEMS, ENCHANTS, P_TWO_OR_MORE };
