// 마영전 스펙 진단기 — Express 서버
// 브라우저는 이 서버만 호출하고, NEXON Open API 키는 서버에만 둔다.

try { require('fs').readFileSync('.env', 'utf8').split('\n').forEach((l) => { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }); } catch {}

const path = require('path');
const express = require('express');
const dungeonsData = require('./data/dungeons.json');
const { buildCatalog, SLOT_CAPACITY } = require('./src/catalog');
const { advise, itemsInCatalog } = require('./src/advisor');
const { extractStats, attackType, STAT_KEYS } = require('./src/stats');
const nexon = require('./src/nexon');
const { parseEquipment } = require('./src/equipment');
const { buildDynamicActions, DYNAMIC_ITEMS } = require('./src/dynamic');

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const catalog = buildCatalog();
const allItems = [...new Set([...itemsInCatalog(catalog), ...DYNAMIC_ITEMS])].sort();

const handle = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(e.status && e.status < 500 ? e.status : 500).json({ error: e.message || '서버 오류' });
  });

app.get('/api/meta', (req, res) => {
  res.json({
    mock: nexon.cfg.mock,
    statKeys: STAT_KEYS,
    statLabels: dungeonsData._meta.statLabels,
    dungeonsUpdated: dungeonsData._meta.updated,
    slotCapacity: SLOT_CAPACITY,
  });
});

// 만크리 = 던전 크리티컬 요구치 + 50, 만밸런스 = 밸런스 요구치 + 100
const CAP_BONUS = { crit: 50, bal: 100 };
const capStatsOf = (d) => Object.fromEntries(Object.entries(CAP_BONUS)
  .filter(([k]) => d.minStats[k] !== undefined).map(([k, b]) => [k, d.minStats[k] + b]));
const dungeons = dungeonsData.dungeons.map((d) => ({ ...d, capStats: capStatsOf(d) }));

app.get('/api/dungeons', (req, res) => res.json(dungeons));

app.get('/api/catalog', (req, res) => res.json(catalog));

app.get('/api/character', handle(async (req, res) => {
  const name = String(req.query.name || '').trim();
  if (!name) return res.status(400).json({ error: '캐릭터 이름을 입력하세요.' });
  const ch = await nexon.getCharacter(name);
  const className = ch.basic?.character_class_name || null;
  const { stats, missing } = extractStats(ch.stat, className);
  res.json({
    name: ch.basic?.character_name || name,
    basic: ch.basic,
    className,
    attackType: attackType(className),
    stats,
    missing,
    mock: ch.mock,
    equipment: (() => {
      if (!ch.equipment) return null;
      const eq = parseEquipment(ch.equipment, catalog);
      eq.dynamicActions = buildDynamicActions(eq.items);
      return eq;
    })(),
    raw: req.query.raw ? { stat: ch.stat, equipment: ch.equipment } : undefined,
  });
}));

// 장비 원본 응답 확인용 (인챈트·연마·강화 자동 불러오기를 붙이기 전 스키마 확인)
app.get('/api/debug/equipment', handle(async (req, res) => {
  const name = String(req.query.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name 파라미터에 캐릭터 이름을 넣으세요.' });
  res.json(await nexon.getEquipmentRaw(name));
}));

// 거래소 원본 응답 확인용
app.get('/api/debug/auction', handle(async (req, res) => {
  // ?item=아이템명&param=파라미터이름 (param 생략 시 설정값, item= 비우면 파라미터 없이 호출)
  const item = req.query.item === undefined ? '고급 강화의 비약' : String(req.query.item).trim();
  const param = req.query.param ? String(req.query.param).replace(/[^a-z_]/g, '') : undefined;
  res.json(await nexon.getAuctionRaw(item, param));
}));

app.get('/api/prices', handle(async (req, res) => {
  const prices = await nexon.getPrices(allItems);
  const vals = Object.values(prices);
  const found = vals.filter((p) => p.unit != null).length;
  const firstError = vals.find((p) => p.error)?.error || null;
  if (!nexon.cfg.mock && found === 0) console.warn(`거래소 시세를 하나도 못 불러왔습니다. 오류: ${firstError || '응답에서 가격을 찾지 못함'} → /api/debug/auction 으로 원본 응답을 확인하세요.`);
  res.json({ mock: nexon.cfg.mock, prices, found, total: vals.length, firstError, fetchedAt: new Date().toISOString() });
}));

app.post('/api/advise', handle(async (req, res) => {
  const { stats, dungeonId, progress, disabled, priceOverrides, opts, equipmentItems } = req.body || {};
  // 장비에 따라 달라지는 방법(정령석·인챈트 교체·팔찌)을 이번 계산에만 더한다
  const fullCatalog = [...catalog, ...buildDynamicActions(Array.isArray(equipmentItems) ? equipmentItems.slice(0, 40) : [])];
  const base = dungeons.find((d) => d.id === dungeonId);
  if (!base) return res.status(400).json({ error: '던전을 선택하세요.' });
  // 목표가 만크리/만밸런스면 그 스탯의 요구치를 올려서 계산
  const goal = opts?.goal || {};
  const minStats = { ...base.minStats };
  if (goal.critCap && base.capStats.crit) minStats.crit = base.capStats.crit;
  if (goal.balCap && base.capStats.bal) minStats.bal = base.capStats.bal;
  const dungeon = { ...base, minStats };
  if (!stats || typeof stats !== 'object') return res.status(400).json({ error: '스탯이 없습니다.' });

  const clean = {};
  for (const k of STAT_KEYS) if (Number.isFinite(Number(stats[k])) && stats[k] !== '' && stats[k] !== null) clean[k] = Number(stats[k]);

  const fetched = await nexon.getPrices(allItems);
  const prices = {};
  for (const [n, p] of Object.entries(fetched)) prices[n] = p.unit;
  for (const [n, v] of Object.entries(priceOverrides || {})) {
    if (v === '' || v === null || v === undefined) continue;
    const num = Number(v);
    if (Number.isFinite(num) && num >= 0) prices[n] = num;
  }

  const lucky = Number(opts?.luckyMultiplier);
  const result = advise({
    stats: clean,
    dungeon,
    catalog: fullCatalog,
    prices,
    progress: progress || {},
    disabled: disabled || [],
    opts: { luckyMultiplier: Number.isFinite(lucky) && lucky >= 1 && lucky <= 3 ? lucky : 1 },
  });
  // 착용 개수보다 많은 장신구를 켜 두면 경고
  const off = new Set(disabled || []);
  const warnings = [];
  for (const [slot, cap] of Object.entries(SLOT_CAPACITY)) {
    const on = fullCatalog.filter((a) => a.slot === slot && !off.has(a.id));
    if (on.length > cap) warnings.push(`${slot === 'ring' ? '반지' : slot}는 ${cap}개까지 착용 가능한데 ${on.length}개가 계산에 들어가 있습니다: ${on.map((a) => a.target).join(', ')}`);
  }
  res.json({ ...result, prices, warnings, goal: { critCap: !!goal.critCap, balCap: !!goal.balCap }, entryStats: base.minStats, mock: nexon.cfg.mock });
}));

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`마영전 스펙 진단기: http://localhost:${PORT}`);
    const fs = require('fs');
    if (!nexon.cfg.mock) console.log('※ NEXON Open API 연결 모드 (실제 캐릭터·시세 사용)');
    else {
      console.log('※ 목업 모드: 캐릭터 스탯을 불러오지 않고, 시세는 예시 값입니다.');
      if (process.env.MOCK === '1') console.log('  이유: MOCK=1 로 설정되어 있음');
      else if (fs.existsSync('.env.txt')) console.log('  이유: .env 가 아니라 .env.txt 로 저장됨 → 파일 이름에서 .txt 를 지워 주세요');
      else if (!fs.existsSync('.env')) console.log(`  이유: ${process.cwd()} 에 .env 파일이 없음 → .env.example 을 복사해 .env 로 만들어 주세요`);
      else console.log('  이유: .env 안의 NEXON_API_KEY 가 비어 있음');
    }
  });
}

module.exports = app;
