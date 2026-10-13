// NEXON Open API 클라이언트 (서버 전용 — API 키는 브라우저로 보내지 않는다)
//
// 마영전 v2 엔드포인트 경로는 .env로 바꿀 수 있게 했다.
// ocid 조회(/id)는 확인된 경로, 나머지는 Open API 문서의 실제 경로로 맞춰서 쓰면 된다.

const fs = require('fs');
const path = require('path');

const cfg = {
  key: process.env.NEXON_API_KEY || '',
  base: process.env.NEXON_BASE || 'https://open.api.nexon.com/heroes/v2',
  pathOcid: process.env.NEXON_PATH_OCID || '/id',
  pathBasic: process.env.NEXON_PATH_BASIC || '/character/basic',
  pathStat: process.env.NEXON_PATH_STAT || '/character/stat',
  pathEquip: process.env.NEXON_PATH_EQUIP || '/character/item-equipment',
  pathAuction: process.env.NEXON_PATH_AUCTION || '/auction/history',
  auctionItemParam: process.env.NEXON_AUCTION_ITEM_PARAM || 'item_name',
  mock: process.env.MOCK === '1' || !process.env.NEXON_API_KEY,
};

const MOCK_DIR = path.join(__dirname, '..', 'data', 'mock');
const readMock = (f) => JSON.parse(fs.readFileSync(path.join(MOCK_DIR, f), 'utf8'));

async function call(p, params) {
  const url = new URL(cfg.base + p);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'x-nxopen-api-key': cfg.key } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || body?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

// ── 짧은 캐시 (거래소 시세는 10분) ──
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

async function getCharacter(name) {
  if (cfg.mock) {
    const m = readMock('character-stat.json');
    return { ocid: 'mock-ocid', basic: { character_name: name, ...m.basic }, stat: m.stat, mock: true };
  }
  const { ocid } = await call(cfg.pathOcid, { character_name: name });
  const [basic, stat, equipment] = await Promise.all([
    call(cfg.pathBasic, { ocid }).catch(() => null),
    call(cfg.pathStat, { ocid }),
    call(cfg.pathEquip, { ocid }).catch(() => null), // 장비는 실패해도 스탯 진단은 계속
  ]);
  return { ocid, basic, stat, equipment, mock: false };
}

// 거래소 응답에서 '개당 가격'으로 보이는 숫자를 모아 중앙값을 낸다.
// 실제 응답 필드명이 확인되면 PRICE_KEYS / COUNT_KEYS만 맞추면 된다.
const PRICE_KEYS = ['auction_price_per_unit', 'unit_price', 'price_per_unit'];
const TOTAL_KEYS = ['auction_price', 'price', 'total_price'];
const COUNT_KEYS = ['item_count', 'count', 'quantity'];

function unitPricesFrom(node, out = []) {
  if (Array.isArray(node)) node.forEach((x) => unitPricesFrom(x, out));
  else if (node && typeof node === 'object') {
    const pk = PRICE_KEYS.find((k) => node[k] !== undefined);
    if (pk) out.push(Number(node[pk]));
    else {
      const tk = TOTAL_KEYS.find((k) => node[k] !== undefined);
      if (tk) {
        const ck = COUNT_KEYS.find((k) => node[k] !== undefined);
        const n = ck ? Number(node[ck]) || 1 : 1;
        out.push(Number(node[tk]) / n);
      }
    }
    Object.values(node).forEach((v) => typeof v === 'object' && unitPricesFrom(v, out));
  }
  return out.filter((x) => Number.isFinite(x) && x > 0);
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function getPrice(itemName) {
  if (cfg.mock) {
    const prices = readMock('prices.json').prices;
    return { item: itemName, unit: prices[itemName] ?? null, samples: prices[itemName] ? 1 : 0, mock: true };
  }
  return cached(`price:${itemName}`, 10 * 60 * 1000, async () => {
    try {
      const body = await call(cfg.pathAuction, { [cfg.auctionItemParam]: itemName });
      const xs = unitPricesFrom(body);
      return { item: itemName, unit: median(xs), samples: xs.length, mock: false };
    } catch (e) {
      return { item: itemName, unit: null, samples: 0, error: e.message, mock: false };
    }
  });
}

async function getPrices(names) {
  const out = {};
  // 호출 제한을 고려해 동시 4개씩
  const queue = [...names];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const n = queue.shift();
      out[n] = await getPrice(n);
    }
  });
  await Promise.all(workers);
  return out;
}

// 장비(인챈트·강화·연마) 원본 응답 — 스키마 확인용
async function getEquipmentRaw(name) {
  if (cfg.mock) return { mock: true, note: '목업 모드에서는 장비 정보를 불러오지 않습니다. NEXON_API_KEY를 넣고 다시 실행하세요.' };
  const { ocid } = await call(cfg.pathOcid, { character_name: name });
  const out = { ocid, path: cfg.pathEquip };
  try { out.response = await call(cfg.pathEquip, { ocid }); } catch (e) { out.error = e.message; out.status = e.status; out.body = e.body; }
  return out;
}

module.exports = { cfg, getCharacter, getEquipmentRaw, getPrices, unitPricesFrom, median };
