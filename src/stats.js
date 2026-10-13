// Open API 응답에서 스탯을 뽑아내는 변환기.
// 마영전 v2 캐릭터 스탯 응답의 정확한 필드명을 고정하지 않고,
// 응답 안에서 "이름 + 값" 쌍을 찾아 한국어 스탯 이름으로 매칭한다.
// 실제 응답 구조가 확인되면 STAT_ALIASES만 손보면 된다.

const STAT_KEYS = ['atk', 'def', 'crit', 'bal', 'addDmg', 'armorPen', 'destruction'];

const STAT_ALIASES = {
  atk: ['공격력', '물리 공격력', 'attack'],
  matk: ['마법 공격력', '마법공격력', 'magic_attack'],
  def: ['방어력', 'defense'],
  crit: ['크리티컬', 'critical'],
  bal: ['밸런스', 'balance'],
  addDmg: ['추가피해', '추가 피해', 'additional_damage'],
  armorPen: ['방어력 관통', '방어력관통', '대항력'],
  destruction: ['파괴력', '공격력 제한 해제'],
};

const NAME_KEYS = ['stat_name', 'name', 'stat_type', 'type', 'key'];
const VALUE_KEYS = ['stat_value', 'value', 'stat_point', 'amount'];

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  return Number(v.replace(/[,\s]/g, ''));
}

function norm(s) {
  return String(s).replace(/\s+/g, '').toLowerCase();
}

function matchKey(name) {
  const n = norm(name);
  for (const [key, aliases] of Object.entries(STAT_ALIASES)) {
    if (aliases.some((a) => norm(a) === n)) return key;
  }
  return null;
}

// 객체 트리 안의 {이름, 값} 쌍과 {스탯이름: 값} 형태를 모두 수집
function collectPairs(node, out = []) {
  if (Array.isArray(node)) {
    node.forEach((x) => collectPairs(x, out));
  } else if (node && typeof node === 'object') {
    const nk = NAME_KEYS.find((k) => typeof node[k] === 'string');
    const vk = VALUE_KEYS.find((k) => node[k] !== undefined && !Number.isNaN(toNumber(node[k])));
    if (nk && vk) out.push([node[nk], toNumber(node[vk])]);
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'object') collectPairs(v, out);
      else if (!NAME_KEYS.includes(k) && !VALUE_KEYS.includes(k) && !Number.isNaN(toNumber(v))) out.push([k, toNumber(v)]);
    }
  }
  return out;
}

function extractStats(raw) {
  const found = {};
  for (const [name, value] of collectPairs(raw)) {
    const key = matchKey(name);
    if (key && found[key] === undefined) found[key] = value;
  }
  // 마법 공격력 캐릭터는 둘 중 큰 값을 공격력으로 본다 (입장 조건이 '공격력(마법 공격력)')
  if (found.matk !== undefined) {
    found.atk = Math.max(found.atk ?? 0, found.matk);
  }
  delete found.matk;
  const stats = {};
  const missing = [];
  for (const k of STAT_KEYS) {
    if (found[k] === undefined) missing.push(k);
    else stats[k] = found[k];
  }
  return { stats, missing };
}

module.exports = { extractStats, STAT_KEYS, STAT_ALIASES };
