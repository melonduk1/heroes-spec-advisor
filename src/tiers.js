// 오르나(115)·와드네(120) 장비 성장 경로.
// 착용 중인 장비가 오르나/와드네일 때만 켜진다(defaultOff, parseEquipment가 켬).
//
// 출처
//  - wadneLaunch: 와드네 출시 테스트 서버 패치노트 (와드네 무기 일반·초급, 와드네 헬름 승급 표, 연마 표)
//  - ep12: 연마 비용 하향(오르나·와드네), 오르나 기본 능력치·연마 최대치 변경
//  - ep13: 와드네 파괴력 II 연마 상향 (무기 45/4500, 머리·손·발 15/1320, 가슴·다리 15/2220)
//  - wadneToEriu: 전설 와드네 → 에리우 무기 제작 시 공격력·추가피해 동일, 밸런스·크리티컬 +8 (유저 확인 글)
//
// 패치노트에 없는 값
//  - 오르나 연마 재료: 골드만 공개 → "직접 입력" 항목으로 두고 사용자가 1회분 가치를 넣게 한다
//  - 와드네 무기 초급→전설 단계별 수치·재료: 전설 수치(38400/4250)만 확인 → 4단계로 균등 분배(추정), 재료는 직접 입력
//  - 와드네 건틀릿·부츠 승급 방어력: 에리우 건틀릿이 에리우 헬름과 같은 표를 쓰므로 와드네 헬름 표와 같다고 가정
//  - 와드네 메일·그리브즈 승급 표: 확인 못 함 → 연마만 계산
//  - 오르나 → 와드네 제작: 15강 오르나의 실제 능력치를 몰라 계산하지 않음

const SRC = {
  wadneLaunch: 'https://heroes.nexon.com/news/update/view?postno=1113',
  ep12: 'https://heroes.nexon.com/news/update/View?postno=1181',
  ep13: 'https://heroes.nexon.com/news/update/view?postno=1194',
  wadneToEriu: 'https://arca.live/b/mabinogiheroes/141975255',
  recipe: 'https://namu.wiki/w/%EB%A7%88%EB%B9%84%EB%85%B8%EA%B8%B0%20%EC%98%81%EC%9B%85%EC%A0%84/90%EC%A0%9C%20%EC%9D%B4%EC%83%81%20%EC%9E%A5%EB%B9%84',
};

// 거래소에 없는, 사용자가 골드 가치를 직접 넣는 항목 (시세 조회에서 제외)
const MANUAL = '(직접 입력)';
const isManualItem = (name) => name.includes(MANUAL);

const INJ = (n) => ({
  '힘이 주입된 뉴에라의 옷감': n,
  '힘이 주입된 뉴에라의 가죽': n,
  '힘이 주입된 뉴에라의 광석': n,
  '힘이 주입된 뉴에라의 오브': n,
});

// ───────────── 장비 부위 ─────────────
// slot: API 슬롯 이름, part: 승급 재료 이름에 들어가는 부위명
const PARTS = {
  weapon: { slot: 'Right Hand', name: '무기' },
  helm: { slot: 'Head', name: '헬름', part: '머리 방어구', essence: '스렝의 정수', crystal: '단단한 와드네의 결정' },
  mail: { slot: 'Upper', name: '메일', part: '가슴 방어구', essence: '고르바스의 정수', crystal: '견고한 와드네의 결정' },
  greaves: { slot: 'Lower', name: '그리브즈', part: '다리 방어구', essence: '스피노스의 정수', crystal: '매끈한 와드네의 결정' },
  gauntlet: { slot: 'Hand', name: '건틀릿', part: '손 방어구', essence: '모르간트의 정수', crystal: '굳건한 와드네의 결정' },
  boots: { slot: 'Leg', name: '부츠', part: '발 방어구', essence: '모르간트의 정수', crystal: '굳건한 와드네의 결정' },
};

const label = (series, key) => `${series === 'orna' ? '오르나' : '와드네'} ${PARTS[key].name}`;

function polish(series, key, stat, name, per, max, cost, extra = {}) {
  return {
    id: `polish-${series}-${key}-${stat}`, type: 'repeat', group: '연마',
    target: label(series, key), series, part: key, defaultOff: true,
    name: `${label(series, key)} 연마: ${name}`,
    gain: { [statKey(stat)]: per }, per, maxSteps: Math.ceil(max / per),
    cost, ...extra,
  };
}
const statKey = (s) => ({ dest1: 'destruction', dest2: 'destruction', dest: 'destruction' }[s] || s);

// ───────────── 오르나 연마 (ep12 기준, 재료는 패치노트에 없음) ─────────────
const ORNA_ARMOR = {
  helm: { def: 253, dest: 700 },
  gauntlet: { def: 253, dest: 700 },
  boots: { def: 253, dest: 700 },
  mail: { def: 246, dest: 1050 },
  greaves: { def: 234, dest: 1050 },
};
const manual = (gold, what) => ({ gold, items: { [`오르나 ${what} 연마 재료 1회분 ${MANUAL}`]: 1 } });

function ornaActions() {
  const note = '골드는 패치노트 기준, 재료는 공개되지 않아 "직접 입력" 항목으로 따로 받아요.';
  const src = { source: SRC.ep12, note };
  const a = [
    polish('orna', 'weapon', 'atk', '공격력', 14, 1078, manual(105000, '공격력'), { luckyEligible: true, ...src }),
    polish('orna', 'weapon', 'bal', '밸런스', 1, 4, manual(2100000, '밸런스·크리티컬'), { luckyEligible: true, ...src }),
    polish('orna', 'weapon', 'crit', '크리티컬', 1, 8, manual(2100000, '밸런스·크리티컬'), { luckyEligible: true, ...src }),
    polish('orna', 'weapon', 'dest', '파괴력', 50, 5400, manual(700000, '무기 공격력 제한 해제'), { luckyEligible: false, ...src }),
  ];
  for (const [key, v] of Object.entries(ORNA_ARMOR)) {
    a.push(
      polish('orna', key, 'def', '방어력', 10, v.def, manual(105000, '방어력'), { luckyEligible: true, ...src }),
      polish('orna', key, 'dest', '파괴력', 14, v.dest, manual(280000, '방어구 공격력 제한 해제'), { luckyEligible: false, ...src }),
    );
  }
  return a;
}

// ───────────── 와드네 연마 (ep12 비용, ep13 파괴력 II) ─────────────
const WADNE_ARMOR = {
  helm: { def: 479, d1: 700, d2: 1320 },
  gauntlet: { def: 479, d1: 700, d2: 1320 },
  boots: { def: 479, d1: 700, d2: 1320 },
  mail: { def: 596, d1: 1050, d2: 2220 },
  greaves: { def: 567, d1: 1050, d2: 2220 },
};
const ARMOR_BASIC = { gold: 350000, items: { ...INJ(3), '봉인의 힘: 파편': 25 } };
const ARMOR_D1 = { gold: 280000, items: { '투쟁의 조각 3단계': 1, '뉴에라의 옷감': 12, '뉴에라의 가죽': 12 } };
const ARMOR_D2 = { gold: 700000, items: { '투쟁의 결정': 1, '힘이 주입된 뉴에라의 옷감': 17, '힘이 주입된 뉴에라의 가죽': 17 } };

function wadnePolish() {
  const a = [
    polish('wadne', 'weapon', 'atk', '공격력', 10, 2000, { gold: 350000, items: { ...INJ(3), '봉인의 힘: 파편': 25 } }, { luckyEligible: true, source: SRC.ep12 }),
    polish('wadne', 'weapon', 'bal', '밸런스', 1, 4, { gold: 3500000, items: { ...INJ(14), '전승의 힘: 파편': 200 } }, { luckyEligible: true, source: SRC.ep12 }),
    polish('wadne', 'weapon', 'crit', '크리티컬', 1, 4, { gold: 3500000, items: { ...INJ(14), '전승의 힘: 파편': 200 } }, { luckyEligible: true, source: SRC.ep12 }),
    polish('wadne', 'weapon', 'dest1', '파괴력 I', 50, 5400, { gold: 700000, items: { '미지의 조각 3단계': 3, '뉴에라의 광석': 25, '뉴에라의 오브': 20 } }, { luckyEligible: false, source: SRC.ep12 }),
    polish('wadne', 'weapon', 'dest2', '파괴력 II', 45, 4500, { gold: 2100000, items: { '미지의 결정': 3, '힘이 주입된 뉴에라의 광석': 35, '힘이 주입된 뉴에라의 오브': 35 } }, {
      luckyEligible: false, source: SRC.ep13, requires: '공격력·밸런스·크리티컬·파괴력 I 연마를 모두 최대로 해야 열림',
    }),
  ];
  for (const [key, v] of Object.entries(WADNE_ARMOR)) {
    a.push(
      polish('wadne', key, 'def', '방어력', 10, v.def, ARMOR_BASIC, { luckyEligible: true, source: SRC.ep12 }),
      polish('wadne', key, 'dest1', '파괴력 I', 14, v.d1, ARMOR_D1, { luckyEligible: false, source: SRC.ep12 }),
      polish('wadne', key, 'dest2', '파괴력 II', 15, v.d2, ARMOR_D2, {
        luckyEligible: false, source: SRC.ep13, requires: '방어력·크리티컬 저항·파괴력 I 연마를 모두 최대로 해야 열림',
      }),
    );
  }
  return a;
}

// ───────────── 와드네 승급 → 에리우 제작 → 에리우 승급 (한 줄의 경로) ─────────────
const GRADES = ['일반', '초급', '중급', '고급', '레어', '전설'];

// 와드네 방어구 승급 표 (와드네 헬름 출시 패치노트)
const WADNE_ARMOR_TIER = [
  { gold: 500000, stone: 1, crystal: 5, rune: 1, elixir: 0, steel: 5 },
  { gold: 750000, stone: 1, crystal: 5, rune: 1, elixir: 5, steel: 11 },
  { gold: 1150000, stone: 2, crystal: 10, rune: 2, elixir: 10, steel: 24 },
  { gold: 1700000, stone: 2, crystal: 10, rune: 2, elixir: 14, steel: 53 },
  { gold: 2500000, stone: 2, crystal: 10, rune: 2, elixir: 30, steel: 117 },
];
const WADNE_HELM_DEF = [4338, 4448, 4558, 4668, 4778, 4888];

function wadneArmorSteps(key) {
  const p = PARTS[key];
  return WADNE_ARMOR_TIER.map((t, i) => ({
    label: `와드네 ${GRADES[i]}→${GRADES[i + 1]}`,
    gain: { def: WADNE_HELM_DEF[i + 1] - WADNE_HELM_DEF[i], addDmg: 30 },
    rate: 1,
    cost: {
      gold: t.gold,
      items: {
        [`와드네 승급석: ${p.part}`]: t.stone,
        [p.essence]: 1,
        [`와드네의 파편: ${p.part}`]: 1,
        [p.crystal]: t.crystal,
        '프리미엄 방어구 강화의 룬': t.rune,
        '자르딘 강철': t.steel,
        ...(t.elixir ? { '고급 강화의 비약': t.elixir } : {}),
      },
    },
  }));
}

// 에리우 방어구 제작 재료 (나무위키 제작 레시피)
const ERIU_ARMOR_CRAFT = {
  helm: { part: '머리 방어구', crystal: '단단한 에리우의 결정', essence: '루시안의 정수' },
  gauntlet: { part: '손 방어구', crystal: '굳건한 에리우의 결정', essence: '에스라스의 정수' },
  boots: { part: '발 방어구', crystal: '완강한 에리우의 결정', essence: '모르페서의 정수' },
};

function addCost(a, b) {
  const items = { ...a.items };
  for (const [n, q] of Object.entries(b.items || {})) items[n] = (items[n] || 0) + q;
  return { gold: (a.gold || 0) + (b.gold || 0), items };
}

function wadneArmorPath(key, eriuArmor) {
  const steps = wadneArmorSteps(key);
  const craft = ERIU_ARMOR_CRAFT[key];
  const eriu = craft && eriuArmor.find((x) => x.id === `upgrade-${key}`);
  let note = '승급은 100% 성공. 와드네 헬름 승급 표 기준(추가피해 +30/단계).';
  if (key !== 'helm') note += ` ${PARTS[key].name}의 방어력 상승량은 헬름과 같다고 가정했어요.`;
  if (eriu) {
    const cc = { gold: 0, items: { [`에리우의 파편: ${craft.part}`]: 2, [craft.crystal]: 10, '고급 강화의 비약': 15, [craft.essence]: 4 } };
    // 에리우 제작 자체는 방어력이 그대로라(전설 와드네 = 일반 에리우) 제작 비용을 에리우 첫 승급에 합친다
    const [first, ...rest] = eriu.steps;
    steps.push(
      { ...first, label: `에리우 제작 + 에리우 ${first.label}`, cost: addCost(cc, first.cost) },
      ...rest.map((s) => ({ ...s, label: `에리우 ${s.label}` })),
    );
    note += ' 전설 와드네에서 에리우로 제작하면 연마 수치는 그대로 넘어가요.';
  } else {
    note += ' 에리우 부츠는 아직 없어서 전설 와드네까지만 계산해요.';
  }
  return {
    id: `path-wadne-${key}`, type: 'sequence', group: '승급', target: label('wadne', key),
    series: 'wadne', part: key, defaultOff: true, estimated: key !== 'helm',
    gradeNames: [...GRADES.map((g) => `와드네 ${g}`), ...(eriu ? GRADES.slice(1).map((g) => `에리우 ${g}`) : [])],
    name: eriu ? `${label('wadne', key)} 승급 → 에리우` : `${label('wadne', key)} 승급`,
    steps, note, source: SRC.wadneLaunch,
  };
}

function wadneWeaponPath(eriuWeapon) {
  const first = {
    label: '와드네 일반→초급', gain: { atk: 500, addDmg: 100 }, rate: 1,
    cost: { gold: 1000000, items: { '와드네 승급석: 무기': 1, '스렝의 정수': 1, '와드네의 파편: 무기': 1, '예리한 와드네의 결정': 10, '프리미엄 강화의 룬': 2, '자르딘 강철': 15 } },
  };
  // 초급(35400/3850) → 전설(38400/4250): 단계별 값은 미확인이라 4단계로 나눔
  const mid = [1, 2, 3, 4].map((i) => ({
    label: `와드네 ${GRADES[i]}→${GRADES[i + 1]}`, gain: { atk: 750, addDmg: 100 }, rate: 1, estimated: true,
    cost: { gold: 0, items: { [`와드네 무기 승급 재료 1단계분 ${MANUAL}`]: 1 } },
  }));
  const craft = {
    label: '에리우 무기 제작', gain: { crit: 8, bal: 8 }, rate: 1,
    cost: { gold: 0, items: { '에리우의 파편: 무기': 2, '예리한 에리우의 결정': 10, '고급 강화의 비약': 15, '루시안의 정수': 4 } },
  };
  return {
    id: 'path-wadne-weapon', type: 'sequence', group: '승급', target: label('wadne', 'weapon'),
    series: 'wadne', part: 'weapon', defaultOff: true,
    gradeNames: [...GRADES.map((g) => `와드네 ${g}`), ...GRADES.slice(0, eriuWeapon.steps.length + 1).map((g) => `에리우 ${g}`)],
    name: '와드네 무기 승급 → 에리우',
    steps: [first, ...mid, craft, ...eriuWeapon.steps.map((s) => ({ ...s, label: `에리우 ${s.label}` }))],
    note: '와드네 초급→전설은 전설 수치(공격력 38400, 추가피해 4250)만 확인돼서 단계마다 똑같이 나눈 추정치이고, 재료는 직접 입력해야 해요. 에리우 제작은 공격력·추가피해는 그대로, 밸런스·크리티컬 +8. 연마 수치는 그대로 넘어가요.',
    source: SRC.wadneLaunch,
  };
}

/**
 * @param eriuWeapon  catalog의 upgrade-eriu-weapon 액션
 * @param eriuArmor   catalog의 upgrade-<부위> 액션 목록
 */
function tierActions(eriuWeapon, eriuArmor) {
  return [
    ...ornaActions(),
    ...wadnePolish(),
    wadneWeaponPath(eriuWeapon),
    ...['helm', 'gauntlet', 'boots'].map((k) => wadneArmorPath(k, eriuArmor)),
  ];
}

// 장비 이름 → 시리즈
const seriesOf = (name) => (name.includes('에리우') ? 'eriu' : name.includes('와드네') ? 'wadne' : name.includes('오르나') ? 'orna' : null);

module.exports = { tierActions, PARTS, GRADES, seriesOf, isManualItem, MANUAL };
