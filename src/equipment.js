// 장비 API 응답(/character/item-equipment) → 장비 진행 상황(연마 횟수·강화 단계·승급 등급·인챈트)
//
// 확인된 응답 구조 (2026-10 기준)
//   item_equipment[]: { item_equipment_page: 'Bag'(실제 장비) | 'Cash'(아바타),
//                       item_equipment_slot_name: 'Right Hand' | 'Head' | 'Upper' | 'Lower' | 'Hand' | 'Leg' | 'Right Finger' ...,
//                       item_name: '레어 에리우 소울블레이드',
//                       item_option: { enhancement_level, tuning_stat[{stat_name, stat_value}],
//                                      prefix_enchant_use_preset_no, prefix_enchant_preset_1, suffix_... } }
//   tuning_stat의 '공격력 제한 해제'는 파괴력 I + II 합계로 온다.

const GRADES = ['일반', '초급', '중급', '고급', '레어', '전설'];

// 카탈로그 장비 → 장비 슬롯과 이름 조건
const ERIU_SLOTS = {
  weapon: { slot: 'Right Hand', label: '에리우 무기' },
  helm: { slot: 'Head', label: '에리우 헬름' },
  mail: { slot: 'Upper', label: '에리우 메일' },
  greaves: { slot: 'Lower', label: '에리우 그리브즈' },
  gauntlet: { slot: 'Hand', label: '에리우 건틀릿' },
};

const ACCESSORIES = {
  'enhance-ring-mortal': '필멸의 굴레',
  'enhance-ring-silence': '침묵의 증표',
  'enhance-ring-calm': '고요의 증표',
  'enhance-earring-plenty': '풍요의 근본',
  'enhance-belt-starlight': '스타라이트 벨트',
};

// 카탈로그 인챈트 → 장비에 붙는 이름 (접두는 '~의/~한', 접미는 명사)
const ENCHANTS = {
  'enchant-tragic': '비극의',
  'enchant-full': '가득한',
  'enchant-dyed': '물드는',
  'enchant-wander': '헤매는',
  'enchant-dry': '메마른',
  'enchant-transcend': '초월의',
  'enchant-advent': '강림',
};

const num = (v) => Number(String(v ?? '').replace(/,/g, '')) || 0;

function gradeOf(name) {
  const g = GRADES.findIndex((x, i) => i > 0 && name.startsWith(`${x} `));
  return g > 0 ? g : 0;
}

function tuning(opt) {
  const t = {};
  for (const s of opt?.tuning_stat || []) t[s.stat_name] = num(s.stat_value);
  return t;
}

function activeEnchants(opt) {
  if (!opt) return { prefix: null, suffix: null };
  const pick = (kind) => {
    const no = opt[`${kind}_enchant_use_preset_no`] || 1;
    return opt[`${kind}_enchant_preset_${no}`] || null;
  };
  return { prefix: pick('prefix'), suffix: pick('suffix') };
}

/**
 * @returns {{ progress, enable, items, notes }}
 *  progress: { actionId: 진행 횟수/단계 }
 *  enable:   { actionId: true|false } — 장착하지 않은 장비의 성장은 끔
 *  items:    화면 표시용 장착 장비 요약
 */
function parseEquipment(raw, catalog) {
  const list = (raw?.item_equipment || []).filter((i) => i.item_equipment_page === 'Bag');
  const bySlot = Object.fromEntries(list.map((i) => [i.item_equipment_slot_name, i]));
  const progress = {};
  const enable = {};
  const notes = [];
  const ids = new Set(catalog.map((a) => a.id));
  const setP = (id, v) => { if (ids.has(id)) progress[id] = v; };
  const setE = (id, v) => { if (ids.has(id)) enable[id] = v; };
  const maxOf = (id) => catalog.find((a) => a.id === id)?.maxSteps ?? Infinity;
  const steps = (id, value, per) => Math.min(maxOf(id), Math.ceil(value / per - 1e-9));

  // 파괴력 합계를 I(먼저 최대) → II 순서로 나눈다
  const splitDestruction = (total, id1, per1, id2, per2) => {
    const max1 = maxOf(id1) * per1;
    const d1 = Math.min(total, max1);
    setP(id1, steps(id1, d1, per1));
    setP(id2, total > max1 ? steps(id2, total - max1, per2) : 0);
  };

  // ── 에리우 무기·방어구 ──
  for (const [key, { slot, label }] of Object.entries(ERIU_SLOTS)) {
    const it = bySlot[slot];
    const isEriu = !!it && it.item_name.includes('에리우');
    const related = catalog.filter((a) => a.target === label).map((a) => a.id);
    related.forEach((id) => setE(id, isEriu));
    if (!isEriu) {
      if (it) notes.push(`${label}이 아니라 '${it.item_name}'을(를) 착용 중이라 ${label} 관련 성장은 계산에서 뺐어요.`);
      continue;
    }
    const t = tuning(it.item_option);
    const grade = gradeOf(it.item_name);
    if (key === 'weapon') {
      setP('upgrade-eriu-weapon', grade);
      setP('polish-weapon-atk', steps('polish-weapon-atk', t['공격력'] ?? t['마법공격력'] ?? t['마법 공격력'] ?? 0, 10));
      setP('polish-weapon-bal', steps('polish-weapon-bal', t['밸런스'] || 0, 1));
      setP('polish-weapon-crit', steps('polish-weapon-crit', t['크리티컬'] || 0, 1));
      splitDestruction(t['공격력 제한 해제'] ?? t['파괴력'] ?? 0, 'polish-weapon-dest1', 50, 'polish-weapon-dest2', 45);
    } else {
      setP(`upgrade-${key}`, grade);
      setP(`polish-${key}-def`, steps(`polish-${key}-def`, t['방어력'] || 0, 10));
      splitDestruction(t['공격력 제한 해제'] ?? t['파괴력'] ?? 0, `polish-${key}-dest1`, 14, `polish-${key}-dest2`, 15);
    }
  }

  // ── 와드네 부츠 ──
  const leg = bySlot.Leg;
  const wadneBoots = !!leg && leg.item_name.includes('와드네 부츠');
  catalog.filter((a) => a.target === '와드네 부츠').forEach((a) => setE(a.id, wadneBoots));
  if (wadneBoots) {
    const t = tuning(leg.item_option);
    setP('polish-wadne-boots-def', steps('polish-wadne-boots-def', t['방어력'] || 0, 10));
    splitDestruction(t['공격력 제한 해제'] ?? t['파괴력'] ?? 0, 'polish-wadne-boots-dest1', 14, 'polish-wadne-boots-dest2', 15);
  }

  // ── 장신구 강화: 착용한 것만 켠다 ──
  for (const [id, name] of Object.entries(ACCESSORIES)) {
    const it = list.find((i) => i.item_name === name);
    setE(id, !!it);
    if (it) setP(id, Math.min(20, num(it.item_option?.enhancement_level)));
  }

  // ── 인챈트: 이미 붙어 있으면 적용함으로 ──
  const applied = new Set();
  for (const it of list) {
    const e = activeEnchants(it.item_option);
    if (e.prefix) applied.add(e.prefix);
    if (e.suffix) applied.add(e.suffix);
  }
  for (const [id, name] of Object.entries(ENCHANTS)) if (applied.has(name)) setP(id, 1);

  const items = list.map((i) => {
    const e = activeEnchants(i.item_option);
    return {
      slot: i.item_equipment_slot_name,
      name: i.item_name,
      enhancement: i.item_option?.enhancement_level ?? null,
      enchant: [e.prefix, e.suffix].filter(Boolean).join(' '),
      prefix: e.prefix,
      suffix: e.suffix,
      tuning: tuning(i.item_option),
    };
  });

  return { progress, enable, items, notes };
}

module.exports = { parseEquipment, gradeOf };
