// 성장 방식 카탈로그.
// 수치는 전부 공식 패치노트 기준(출처 링크는 각 항목 source).
// 패치로 수치가 바뀌면 이 파일만 고치면 된다.
//
// 액션 종류
//  - repeat   : 같은 비용·같은 상승량을 최대 maxSteps번 반복 (연마)
//  - sequence : 단계마다 비용·상승량·성공률이 다른 연속 단계 (강화, 승급)
//  - once     : 한 번만 하는 것 (인챈트)
//
// 비용 표기: { gold: 골드, items: { '아이템 이름': 수량 } }
// 성공률이 1 미만인 단계는 '연속 실패 보너스(천장)'까지 반영한 기대 시도 횟수로 비용을 계산한다.

const { tierActions } = require('./tiers');

const SRC = {
  ep12: 'https://heroes.nexon.com/news/update/View?postno=1181',
  ep13: 'https://heroes.nexon.com/news/update/view?postno=1194',
  ep14: 'https://heroes.nexon.com/news/update/View?postno=1212',
  ep15: 'https://heroes.nexon.com/news/update/View?postno=1235',
  ep11: 'https://heroes.nexon.com/news/update/View?postno=1170',
  throne: 'https://heroes.nexon.com/news/update/View?postno=1199',
};

const INJ = (n) => ({
  '힘이 주입된 뉴에라의 옷감': n,
  '힘이 주입된 뉴에라의 가죽': n,
  '힘이 주입된 뉴에라의 광석': n,
  '힘이 주입된 뉴에라의 오브': n,
});

// ───────────── 연마 (repeat) ─────────────
const polishBasicArmor = { gold: 350000, items: { ...INJ(3), '봉인의 힘: 파편': 25 } };
const polishDestI_Armor = { gold: 280000, items: { '투쟁의 조각 3단계': 1, '뉴에라의 옷감': 12, '뉴에라의 가죽': 12 } };
const polishDestII_Armor = { gold: 700000, items: { '투쟁의 결정': 1, '힘이 주입된 뉴에라의 옷감': 17, '힘이 주입된 뉴에라의 가죽': 17 } };

const ERIU_ARMOR = [
  // slot, 표기, 방어력 최대, 파괴력 I 최대, 파괴력 II 최대, 출처
  { slot: 'helm', label: '에리우 헬름', defMax: 479, d1Max: 700, d2Max: 2640, src: SRC.ep13 },
  { slot: 'gauntlet', label: '에리우 건틀릿', defMax: 479, d1Max: 700, d2Max: 2640, src: SRC.ep15 },
  { slot: 'greaves', label: '에리우 그리브즈', defMax: 567, d1Max: 1050, d2Max: 4440, src: SRC.ep13 },
  { slot: 'mail', label: '에리우 메일', defMax: 596, d1Max: 1050, d2Max: 4440, src: SRC.ep14 },
];

function polishActions() {
  const a = [
    {
      id: 'polish-weapon-atk', type: 'repeat', group: '연마', target: '에리우 무기',
      name: '에리우 무기 연마: 공격력', gain: { atk: 10 }, maxSteps: 200,
      cost: { gold: 350000, items: { ...INJ(3), '봉인의 힘: 파편': 25 } },
      luckyEligible: true, source: SRC.ep12,
    },
    {
      id: 'polish-weapon-bal', type: 'repeat', group: '연마', target: '에리우 무기',
      name: '에리우 무기 연마: 밸런스', gain: { bal: 1 }, maxSteps: 4,
      cost: { gold: 3500000, items: { ...INJ(14), '전승의 힘: 파편': 200 } },
      luckyEligible: true, source: SRC.ep12,
    },
    {
      id: 'polish-weapon-crit', type: 'repeat', group: '연마', target: '에리우 무기',
      name: '에리우 무기 연마: 크리티컬', gain: { crit: 1 }, maxSteps: 4,
      cost: { gold: 3500000, items: { ...INJ(14), '전승의 힘: 파편': 200 } },
      luckyEligible: true, source: SRC.ep12,
    },
    {
      id: 'polish-weapon-dest1', type: 'repeat', group: '연마', target: '에리우 무기',
      name: '에리우 무기 연마: 파괴력 I', gain: { destruction: 50 }, maxSteps: 108,
      cost: { gold: 700000, items: { '미지의 조각 3단계': 3, '뉴에라의 광석': 25, '뉴에라의 오브': 20 } },
      luckyEligible: false, source: SRC.ep12,
    },
    {
      id: 'polish-weapon-dest2', type: 'repeat', group: '연마', target: '에리우 무기',
      name: '에리우 무기 연마: 파괴력 II', gain: { destruction: 45 }, maxSteps: 200,
      cost: { gold: 2100000, items: { '미지의 결정': 3, '힘이 주입된 뉴에라의 광석': 35, '힘이 주입된 뉴에라의 오브': 35 } },
      luckyEligible: false, requires: '공격력·밸런스·크리티컬·파괴력 I 연마를 모두 최대로 해야 열림',
      source: SRC.ep13,
    },
  ];
  for (const p of ERIU_ARMOR) {
    a.push({
      id: `polish-${p.slot}-def`, type: 'repeat', group: '연마', target: p.label,
      name: `${p.label} 연마: 방어력`, gain: { def: 10 }, maxSteps: Math.ceil(p.defMax / 10),
      cost: polishBasicArmor, luckyEligible: true, source: p.src,
    });
    a.push({
      id: `polish-${p.slot}-dest1`, type: 'repeat', group: '연마', target: p.label,
      name: `${p.label} 연마: 파괴력 I`, gain: { destruction: 14 }, maxSteps: Math.ceil(p.d1Max / 14),
      cost: polishDestI_Armor, luckyEligible: false, source: p.src,
    });
    a.push({
      id: `polish-${p.slot}-dest2`, type: 'repeat', group: '연마', target: p.label,
      name: `${p.label} 연마: 파괴력 II`, gain: { destruction: 15 }, maxSteps: Math.ceil(p.d2Max / 15),
      cost: polishDestII_Armor, luckyEligible: false,
      requires: '방어력·크리티컬 저항·파괴력 I 연마를 모두 최대로 해야 열림', source: p.src,
    });
  }
  return a;
}

// ───────────── 장신구 강화 (sequence, 확률) ─────────────
// 1~20강 성공률과 연속 실패 보너스(천장)
const ACC_RATE = [1, 1, 1, 0.9, 0.9, 0.8, 0.7, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.07, 0.03];
// n번 연속 실패한 뒤 다음 시도에 더해지는 보너스. 마지막 값 1 = 확정 성공
function pityFor(level) {
  if (level <= 3) return [];
  if (level <= 5) return [0.02, 1];
  if (level <= 8) return [0.02, 0.03, 0.04, 1];
  if (level <= 10) return [0.02, 0.03, 0.04, 0.05, 0.06, 1];
  if (level <= 15) return [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 1];
  return [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 1];
}

// 에리우 장신구(필멸의 굴레·풍요의 근본·스타라이트 벨트) 강화 표
const ERIU_ACC_PEN = [7, 13, 20, 26, 33, 39, 46, 52, 59, 65, 72, 78, 85, 91, 98, 104, 111, 117, 124, 130];
const ERIU_ACC_GOLD = [16000, 31000, 47000, 78000, 110000, 142000, 189000, 236000, 284000, 347000, 410000, 474000, 553000, 632000, 711000, 806000, 901000, 997000, 1107000, 1250000];
const ERIU_ACC_SEAL = [4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 7, 7, 7, 7, 7];
// [재료 이름, 수량]
const ERIU_ACC_MAT = [
  ['가죽', 4], ['가죽', 4], ['가죽', 4], ['광석', 5], ['광석', 5], ['광석', 5],
  ['옷감', 6], ['옷감', 6], ['옷감', 6], ['가죽', 7], ['가죽', 7], ['가죽', 7],
  ['광석', 9], ['광석', 9], ['광석', 10], ['옷감', 11], ['옷감', 13], ['옷감', 15], ['가죽', 17], ['광석', 20],
];

// 와드네 반지(침묵의 증표·고요의 증표) 강화 표
const WADNE_RING_PEN = [6, 11, 17, 22, 28, 33, 39, 44, 50, 55, 61, 66, 72, 77, 83, 88, 94, 99, 105, 110];
const WADNE_RING_SEAL = [3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 6, 6, 6, 6, 6];
const WADNE_RING_MAT = [
  ['가죽', 3], ['가죽', 3], ['가죽', 3], ['광석', 4], ['광석', 4], ['광석', 4],
  ['옷감', 5], ['옷감', 5], ['옷감', 5], ['가죽', 6], ['가죽', 6], ['가죽', 6],
  ['광석', 7], ['광석', 7], ['광석', 8], ['옷감', 9], ['옷감', 10], ['옷감', 11], ['가죽', 13], ['광석', 15],
];

function accSteps({ atkPer, pen, seal, mats, elixir }) {
  return ACC_RATE.map((rate, i) => ({
    label: `${i}→${i + 1}강`,
    gain: { atk: atkPer, armorPen: pen[i] - (i ? pen[i - 1] : 0) },
    rate,
    pity: pityFor(i + 1),
    cost: {
      gold: ERIU_ACC_GOLD[i],
      items: {
        '봉인의 힘: 파편': seal[i],
        '고급 강화의 비약': elixir,
        [`힘이 주입된 뉴에라의 ${mats[i][0]}`]: mats[i][1],
      },
    },
  }));
}

function accessoryActions() {
  const eriu = [
    { key: 'ring-mortal', label: '필멸의 굴레(반지)', slot: 'ring', src: SRC.ep15 },
    { key: 'earring-plenty', label: '풍요의 근본(귀걸이)', slot: 'earring', src: SRC.ep13 },
    { key: 'belt-starlight', label: '스타라이트 벨트', slot: 'belt', src: SRC.ep14 },
  ].map((x) => ({
    id: `enhance-${x.key}`, type: 'sequence', group: '장신구 강화', target: x.label, slot: x.slot,
    defaultOff: x.slot === 'ring',
    name: `${x.label} 강화`,
    steps: accSteps({ atkPer: 16, pen: ERIU_ACC_PEN, seal: ERIU_ACC_SEAL, mats: ERIU_ACC_MAT, elixir: 2 }),
    note: '실패해도 단계는 유지된다고 가정(패치노트에 하락 언급 없음). AP 소모는 계산에서 제외.',
    source: x.src,
  }));
  const wadne = [
    { key: 'ring-silence', label: '침묵의 증표(반지)' },
    { key: 'ring-calm', label: '고요의 증표(반지)' },
  ].map((x) => ({
    id: `enhance-${x.key}`, type: 'sequence', group: '장신구 강화', target: x.label, slot: 'ring',
    name: `${x.label} 강화`,
    steps: accSteps({ atkPer: 15, pen: WADNE_RING_PEN, seal: WADNE_RING_SEAL, mats: WADNE_RING_MAT, elixir: 1 }),
    note: '실패해도 단계는 유지된다고 가정. AP 소모는 계산에서 제외.',
    source: SRC.ep11,
  }));
  return [...eriu, ...wadne];
}

// ───────────── 에리우 승급 (sequence, 100% 성공) ─────────────
const GRADES = ['일반', '초급', '중급', '고급', '레어', '전설'];

function weaponUpgrade() {
  // 단계별 상승: 공격력 +1250, 크리티컬 +1, 밸런스 +1, 추가피해 +150
  const g = { atk: 1250, crit: 1, bal: 1, addDmg: 150 };
  const steps = [
    { label: '일반→초급', gain: g, rate: 1, cost: { gold: 1500000, items: { '에리우 승급석: 무기': 1, '루시안의 정수': 1, '에리우의 파편: 무기': 1, '예리한 에리우의 결정': 10, '프리미엄 강화의 룬': 2, '타리안 강철': 15 } }, source: SRC.ep12 },
    { label: '초급→중급', gain: g, rate: 1, cost: { gold: 2250000, items: { '에리우 승급석: 무기': 2, '세미아스의 정수': 2, '에리우의 파편: 무기': 2, '예리한 에리우의 결정': 10, '가벼운 에리우의 결정': 10, '프리미엄 강화의 룬': 2, '고급 강화의 비약': 10, '타리안 강철': 33 } }, source: SRC.ep13 },
    { label: '중급→고급', gain: g, rate: 1, cost: { gold: 3375000, items: { '에리우 승급석: 무기': 3, '우스키아스의 정수': 3, '에리우의 파편: 무기': 3, '예리한 에리우의 결정': 10, '가벼운 에리우의 결정': 10, '안정된 에리우의 결정': 10, '+ 프리미엄 강화의 룬': 1, '고급 강화의 비약': 25, '타리안 강철': 72 } }, source: SRC.ep14 },
    { label: '고급→레어', gain: g, rate: 1, cost: { gold: 5100000, items: { '에리우 승급석: 무기': 3, '에스라스의 정수': 3, '에리우의 파편: 무기': 3, '가벼운 에리우의 결정': 10, '안정된 에리우의 결정': 10, '오롯한 에리우의 결정': 10, '+ 프리미엄 강화의 룬': 1, '고급 강화의 비약': 40, '타리안 강철': 159 } }, source: SRC.ep15 },
  ];
  return {
    id: 'upgrade-eriu-weapon', type: 'sequence', group: '승급', target: '에리우 무기',
    name: '에리우 무기 승급', steps, gradeNames: GRADES.slice(0, 5),
    note: '전설 등급은 아직 미출시. 승급은 100% 성공.',
    source: SRC.ep15,
  };
}

// 방어구 승급: 등급별 공통 재료 틀 + 부위별 정수/파편/결정/방어력 상승량
const ARMOR_TIER = [
  { gold: 750000, stone: 1, crystal: 5, rune: 1, steel: 1, elixir: 0 },
  { gold: 1125000, stone: 1, crystal: 5, rune: 1, steel: 2, elixir: 8 },
  { gold: 1725000, stone: 2, crystal: 10, rune: 2, steel: 4, elixir: 16 },
  { gold: 2550000, stone: 2, crystal: 10, rune: 2, steel: 8, elixir: 24 },
  { gold: 3750000, stone: 2, crystal: 10, rune: 2, steel: 16, elixir: 48 },
];
const ARMOR_UPG = [
  { slot: 'helm', label: '에리우 헬름', part: '머리 방어구', essence: '루시안의 정수', crystal: '단단한 에리우의 결정', def: [4888, 5118, 5348, 5578, 5808, 6158], cr: [36, 37, 38, 39, 40, 41], src: SRC.ep12 },
  { slot: 'greaves', label: '에리우 그리브즈', part: '다리 방어구', essence: '세미아스의 정수', crystal: '매끈한 에리우의 결정', def: [4843, 5093, 5343, 5643, 5943, 6243], cr: [57, 58, 59, 61, 63, 66], src: SRC.ep13 },
  { slot: 'mail', label: '에리우 메일', part: '가슴 방어구', essence: '우스키아스의 정수', crystal: '견고한 에리우의 결정', def: [5058, 5339, 5620, 5914, 6208, 6502], cr: [49, 50, 51, 53, 55, 57], src: SRC.ep14 },
  { slot: 'gauntlet', label: '에리우 건틀릿', part: '손 방어구', essence: '에스라스의 정수', crystal: '굳건한 에리우의 결정', def: [4888, 5118, 5348, 5578, 5808, 6158], cr: [36, 37, 38, 39, 40, 41], src: SRC.ep15 },
];

function armorUpgrades() {
  return ARMOR_UPG.map((p) => ({
    id: `upgrade-${p.slot}`, type: 'sequence', group: '승급', target: p.label,
    name: `${p.label} 승급`, gradeNames: GRADES,
    note: '승급은 100% 성공. 추가피해는 등급마다 +45.',
    source: p.src,
    steps: ARMOR_TIER.map((t, i) => ({
      label: `${GRADES[i]}→${GRADES[i + 1]}`,
      gain: { def: p.def[i + 1] - p.def[i], addDmg: 45 },
      rate: 1,
      cost: {
        gold: t.gold,
        items: {
          [`에리우 승급석: ${p.part}`]: t.stone,
          [p.essence]: 1,
          [`에리우의 파편: ${p.part}`]: 1,
          [p.crystal]: t.crystal,
          '프리미엄 방어구 강화의 룬': t.rune,
          '타리안 강철': t.steel,
          ...(t.elixir ? { '고급 강화의 비약': t.elixir } : {}),
        },
      },
    })),
  }));
}

// ───────────── 인챈트 (once) ─────────────
// 성공 확률과 실패 시 장비 파괴 위험은 이 계산에 들어가지 않는다 → risky 표시.
// 인챈트의 '크리티컬 N%'는 실제로 크리티컬 +N 고정 수치다.
function enchantActions() {
  const e = (id, name, target, gain, src, extra = '') => ({
    id: `enchant-${id}`, type: 'once', group: '인챈트', target, name,
    gain, cost: { gold: 0, items: { [name]: 1 } }, risky: true, defaultOff: true,
    note: `인챈트 성공 확률·실패 시 파괴 위험은 비용에 반영되지 않음. 기존 인챈트를 덮어쓰므로 실제로는 '차이'만큼만 오른다.${extra}`,
    source: src,
  });
  return [
    e('tragic', '비극의 인챈트 스크롤', '무기 (접두 3랭크)', { atk: 700, crit: 8, bal: 4 }, SRC.ep12, ' 공격속도 +8 별도.'),
    e('full', '가득한 인챈트 스크롤', '머리/다리 방어구 (접두 3랭크)', { atk: 245, def: 200, crit: 3, bal: 6 }, SRC.ep13),
    e('dyed', '물드는 인챈트 스크롤', '손/발 방어구 (접두 3랭크)', { atk: 145, def: 300, crit: 6, bal: 7 }, SRC.ep15),
    e('wander', '헤매는 인챈트 스크롤', '반지 (접두 3랭크)', { bal: 12 }, SRC.ep15, ' 생명력 -450.'),
    e('dry', '메마른 인챈트 스크롤', '벨트 (접두 3랭크)', { crit: 6, bal: 4 }, SRC.ep14),
    e('transcend', '초월의 인챈트 스크롤', '브로치 (접두 4랭크)', { atk: 600, crit: 2, bal: 2, addDmg: 150 }, SRC.throne),
    e('advent', '강림 인챈트 스크롤', '아티팩트 (접미 4랭크)', { atk: 450, crit: 2, bal: 2 }, SRC.throne),
  ];
}

function buildCatalog() {
  const eriuWeapon = weaponUpgrade();
  const eriuArmor = armorUpgrades();
  return [
    ...polishActions(),
    ...accessoryActions(),
    eriuWeapon,
    ...eriuArmor,
    ...enchantActions(),
    // 오르나·와드네 장비 (착용 중일 때만 켜짐)
    ...tierActions(eriuWeapon, eriuArmor),
  ];
}

// 한 번에 착용할 수 있는 개수 (반지 2개)
const SLOT_CAPACITY = { ring: 2, earring: 1, belt: 1 };

module.exports = { buildCatalog, pityFor, ACC_RATE, SLOT_CAPACITY };
