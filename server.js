// 마영전 스펙 진단기 — Express 서버
// 브라우저는 이 서버만 호출하고, NEXON Open API 키는 서버에만 둔다.

try { require('fs').readFileSync('.env', 'utf8').split('\n').forEach((l) => { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }); } catch {}

const path = require('path');
const express = require('express');
const dungeonsData = require('./data/dungeons.json');
const { buildCatalog, SLOT_CAPACITY } = require('./src/catalog');
const { advise, itemsInCatalog } = require('./src/advisor');
const { extractStats, STAT_KEYS } = require('./src/stats');
const nexon = require('./src/nexon');
const { parseEquipment } = require('./src/equipment');

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const catalog = buildCatalog();
const allItems = itemsInCatalog(catalog);

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

app.get('/api/dungeons', (req, res) => res.json(dungeonsData.dungeons));

app.get('/api/catalog', (req, res) => res.json(catalog));

app.get('/api/character', handle(async (req, res) => {
  const name = String(req.query.name || '').trim();
  if (!name) return res.status(400).json({ error: '캐릭터 이름을 입력하세요.' });
  const ch = await nexon.getCharacter(name);
  const { stats, missing } = extractStats(ch.stat);
  res.json({
    name: ch.basic?.character_name || name,
    basic: ch.basic,
    stats,
    missing,
    mock: ch.mock,
    equipment: ch.equipment ? parseEquipment(ch.equipment, catalog) : null,
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
  const item = String(req.query.item || '고급 강화의 비약').trim();
  res.json(await nexon.getAuctionRaw(item));
}));

app.get('/api/debug/auction-probe', handle(async (req, res) => {
  res.json(await nexon.probeAuction(String(req.query.item || '고급 강화의 비약')));
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
  const { stats, dungeonId, progress, disabled, priceOverrides, opts } = req.body || {};
  const dungeon = dungeonsData.dungeons.find((d) => d.id === dungeonId);
  if (!dungeon) return res.status(400).json({ error: '던전을 선택하세요.' });
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
    catalog,
    prices,
    progress: progress || {},
    disabled: disabled || [],
    opts: { luckyMultiplier: Number.isFinite(lucky) && lucky >= 1 && lucky <= 3 ? lucky : 1 },
  });
  // 착용 개수보다 많은 장신구를 켜 두면 경고
  const off = new Set(disabled || []);
  const warnings = [];
  for (const [slot, cap] of Object.entries(SLOT_CAPACITY)) {
    const on = catalog.filter((a) => a.slot === slot && !off.has(a.id));
    if (on.length > cap) warnings.push(`${slot === 'ring' ? '반지' : slot}는 ${cap}개까지 착용 가능한데 ${on.length}개가 계산에 들어가 있습니다: ${on.map((a) => a.target).join(', ')}`);
  }
  res.json({ ...result, prices, warnings, mock: nexon.cfg.mock });
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
