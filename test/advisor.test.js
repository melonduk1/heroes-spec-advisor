const test = require('node:test');
const assert = require('node:assert');
const { expectedAttempts, advise, diagnose } = require('../src/advisor');
const { extractStats } = require('../src/stats');
const { buildCatalog, pityFor } = require('../src/catalog');
const { unitPricesFrom, median } = require('../src/nexon');
const dungeons = require('../data/dungeons.json').dungeons;

test('기대 시도 횟수: 확정/기하분포/천장', () => {
  assert.equal(expectedAttempts(1), 1);
  assert.equal(expectedAttempts(0.5), 2);
  // 90% + (1회 실패 후 2%) + (2회 실패 후 확정): 1 + 0.1 + 0.1*0.08
  assert.ok(Math.abs(expectedAttempts(0.9, [0.02, 1]) - (1 + 0.1 + 0.1 * 0.08)) < 1e-9);
  // 천장이 있으면 기하분포보다 항상 작거나 같다
  assert.ok(expectedAttempts(0.03, pityFor(20)) < 1 / 0.03);
});

test('스탯 추출: 이름-값 쌍, 쉼표, 마법공격력, 옛 이름', () => {
  const { stats, missing } = extractStats({ stat: [
    { stat_name: '공격력', stat_value: '1,000' },
    { stat_name: '마법 공격력', stat_value: '1200' },
    { stat_name: '대항력', stat_value: '300' },
    { stat_name: '공격력 제한 해제', stat_value: '500' },
  ] });
  assert.equal(stats.atk, 1200);
  assert.equal(stats.armorPen, 300);
  assert.equal(stats.destruction, 500);
  assert.ok(missing.includes('crit'));
});

test('진단: 조건 충족 여부', () => {
  const d = dungeons.find((x) => x.id === 'red-moon-normal');
  assert.equal(diagnose({ ...d.minStats }, d).pass, true);
  const r = diagnose({ ...d.minStats, atk: d.minStats.atk - 100 }, d);
  assert.equal(r.pass, false);
  assert.equal(r.rows.find((x) => x.stat === 'atk').gap, 100);
});

test('추천: 부족분을 메우고 비용이 맞는다', () => {
  const d = dungeons.find((x) => x.id === 'red-moon-normal');
  const catalog = buildCatalog().filter((a) => a.id === 'polish-weapon-atk');
  const prices = { '힘이 주입된 뉴에라의 옷감': 0, '힘이 주입된 뉴에라의 가죽': 0, '힘이 주입된 뉴에라의 광석': 0, '힘이 주입된 뉴에라의 오브': 0, '봉인의 힘: 파편': 0 };
  const r = advise({ stats: { ...d.minStats, atk: d.minStats.atk - 95 }, dungeon: d, catalog, prices });
  assert.equal(r.plan.length, 1);
  assert.equal(r.plan[0].count, 10); // 10회 연마 = +100
  assert.equal(r.totalCost, 10 * 350000);
  assert.equal(r.unresolved.length, 0);
});

test('추천: 진행도가 최대면 후보에서 빠지고 미해결로 남는다', () => {
  const d = dungeons.find((x) => x.id === 'red-moon-normal');
  const catalog = buildCatalog().filter((a) => a.id === 'polish-weapon-bal');
  const r = advise({ stats: { ...d.minStats, bal: d.minStats.bal - 2 }, dungeon: d, catalog, prices: {}, progress: { 'polish-weapon-bal': 4 } });
  assert.equal(r.plan.length, 0);
  assert.deepEqual(r.unresolved, [{ stat: 'bal', gap: 2 }]);
});

test('거래소 응답 파싱: 개당가/총액÷수량', () => {
  const xs = unitPricesFrom({ auction_history: [{ auction_price_per_unit: 100 }, { auction_price: 900, item_count: 3 }, { auction_price_per_unit: 500 }] });
  assert.deepEqual(xs, [100, 300, 500]);
  assert.equal(median(xs), 300);
});

test('던전 데이터: 모든 항목에 출처와 입장 조건', () => {
  for (const d of dungeons) {
    assert.ok(d.source.startsWith('https://heroes.nexon.com'), d.id);
    assert.ok(Object.keys(d.minStats).length >= 6, d.id);
  }
});

test('장비 응답 → 진행 상황 (실제 응답 샘플)', () => {
  const { parseEquipment } = require('../src/equipment');
  const raw = require('./fixtures/equipment-sample.json');
  const catalog = buildCatalog();
  const { progress, enable } = parseEquipment(raw, catalog);
  // 레어 에리우 무기, 연마 공격력 2000 / 밸런스 4 / 크리 4 / 파괴력 합계 9000
  assert.equal(progress['upgrade-eriu-weapon'], 4);
  assert.equal(progress['polish-weapon-atk'], 200);
  assert.equal(progress['polish-weapon-bal'], 4);
  assert.equal(progress['polish-weapon-dest1'], 108);   // 5400
  assert.equal(progress['polish-weapon-dest2'], 80);    // 3600 / 45
  // 전설 에리우 헬름, 파괴력 합계 1165 = I 700 + II 465
  assert.equal(progress['upgrade-helm'], 5);
  assert.equal(progress['polish-helm-dest1'], 50);
  assert.equal(progress['polish-helm-dest2'], 31);
  assert.equal(progress['polish-helm-def'], 48);
  // 장신구: 착용한 반지 2개만 켜짐, 20강
  assert.equal(enable['enhance-ring-mortal'], true);
  assert.equal(enable['enhance-ring-calm'], true);
  assert.equal(enable['enhance-ring-silence'], false);
  assert.equal(progress['enhance-belt-starlight'], 20);
  // 인챈트: 비극의·초월의·강림 등 이미 적용
  assert.equal(progress['enchant-tragic'], 1);
  assert.equal(progress['enchant-advent'], 1);
  assert.equal(progress['enchant-transcend'], 1);
});

test('거래소 응답 → 최근 평균가 (실제 응답 샘플)', () => {
  const { priceFromMarket } = require('../src/nexon');
  const body = require('./fixtures/market-history-sample.json');
  const p = priceFromMarket(body, '고급 강화의 비약');
  assert.equal(p.unit, 319401);              // 가장 최근(2026-10-13T04:00Z) 평균가
  assert.equal(p.at, '2026-10-13T04:00:00Z');
  assert.equal(priceFromMarket(body, '없는 아이템'), null);
  assert.equal(priceFromMarket({ item: [] }, 'x'), null);
});

test('정령석·인챈트 교체·팔찌: 실제 장비에서 생성, 스탯 손실 규칙', () => {
  const { parseEquipment } = require('../src/equipment');
  const { buildDynamicActions } = require('../src/dynamic');
  const eq = parseEquipment(require('./fixtures/equipment-sample.json'), buildCatalog());
  const dyn = buildDynamicActions(eq.items);
  const ring = dyn.find((a) => a.id === 'spirit-crit-RightFinger');   // 밸런스 +2 → 크리 +2
  assert.deepEqual(ring.steps[0].gain, { crit: 2, bal: -2 });
  assert.ok(!dyn.some((a) => a.id === 'spirit-crit-RightHand'));     // 무기는 이미 크리 +2
  const brace = dyn.find((a) => a.id === 'bracelet-LeftWrist');       // 녹슨 → 완전
  assert.deepEqual(brace.steps[0].gain, { atk: 500, crit: 4, destruction: 400 });
  assert.ok(!dyn.some((a) => a.id === 'enchant-swap-prefix-RightHand')); // 이미 비극의

  // 크리·밸런스 둘 다 부족하면 밸런스를 깎는 정령석은 고르지 않는다
  const d = dungeons.find((x) => x.id === 'watcher-temple');
  const stats = { ...d.minStats, crit: d.minStats.crit - 2, bal: d.minStats.bal - 2 };
  const r = advise({ stats, dungeon: d, catalog: [ring], prices: { '고급 정령석': 1 } });
  assert.equal(r.plan.length, 0);
  // 밸런스 여유가 충분하면 고른다
  const r2 = advise({ stats: { ...d.minStats, crit: d.minStats.crit - 2, bal: d.minStats.bal + 5 }, dungeon: d, catalog: [ring], prices: { '고급 정령석': 1 } });
  assert.equal(r2.plan.length, 1);
  assert.equal(r2.unresolved.length, 0);
});

test('인챈트 데이터: 주요 수치', () => {
  const { ENCHANTS } = require('../src/dynamic');
  assert.deepEqual(ENCHANTS.prefix['비극의'], { atk: 700, crit: 8, bal: 4 });
  assert.deepEqual(ENCHANTS.prefix['물드는'], { atk: 145, def: 300, crit: 6, bal: 7 });
  assert.deepEqual(ENCHANTS.suffix['일격'], { atk: 1030, crit: 10, bal: -1 });
  assert.deepEqual(ENCHANTS.suffix['사념'], { def: 500, bal: 1 });
  assert.deepEqual(ENCHANTS.suffix['물결'], { atk: 300 });
  assert.deepEqual(ENCHANTS.suffix['격노'], { def: 400 });
  assert.ok(Object.keys(ENCHANTS.prefix).length > 70 && Object.keys(ENCHANTS.suffix).length > 50);
});

test('클래스에 따라 공격력/마법 공격력 선택', () => {
  const raw = { stat: [{ stat_name: '공격력', stat_value: '81386' }, { stat_name: '마법공격력', stat_value: '82461' }] };
  assert.equal(extractStats(raw, '단아').stats.atk, 82461);   // 마법
  assert.equal(extractStats(raw, '리시타').stats.atk, 81386); // 물리
  assert.equal(extractStats(raw).stats.atk, 82461);           // 모르면 큰 값
});

test('오르나·와드네 장비: 착용 부위만 켜지고 진행도·경로가 계산된다', () => {
  const { buildCatalog } = require('../src/catalog');
  const { parseEquipment } = require('../src/equipment');
  const { advise, itemsInCatalog } = require('../src/advisor');
  const catalog = buildCatalog();
  const raw = JSON.parse(JSON.stringify(require('./fixtures/equipment-sample.json')));
  const set = (slot, name, tuning) => {
    const it = raw.item_equipment.find((i) => i.item_equipment_page === 'Bag' && i.item_equipment_slot_name === slot);
    it.item_name = name;
    it.item_option.tuning_stat = Object.entries(tuning).map(([stat_name, v]) => ({ stat_name, stat_value: String(v) }));
  };
  set('Right Hand', '오르나 소울블레이드', { 공격력: 700, 크리티컬: 8, 밸런스: 2, '공격력 제한 해제': 1000 });
  set('Head', '고급 와드네 헬름', { 방어력: 479, '공격력 제한 해제': 700 + 150 });

  const eq = parseEquipment(raw, catalog);
  assert.equal(eq.enable['polish-orna-weapon-atk'], true);
  assert.equal(eq.enable['polish-weapon-atk'], false); // 에리우 무기 아님
  assert.equal(eq.enable['path-wadne-weapon'], false);
  assert.equal(eq.enable['path-wadne-helm'], true);
  assert.equal(eq.enable['upgrade-helm'], false);
  assert.equal(eq.progress['polish-orna-weapon-atk'], 50);
  assert.equal(eq.progress['polish-orna-weapon-crit'], 8);
  assert.equal(eq.progress['polish-orna-weapon-dest'], 20);
  assert.equal(eq.progress['path-wadne-helm'], 3);
  assert.equal(eq.progress['polish-wadne-helm-dest1'], 50);
  assert.equal(eq.progress['polish-wadne-helm-dest2'], 10);

  // 직접 입력 항목은 거래소 조회 대상이 아니다
  assert.ok(!itemsInCatalog(catalog).some((n) => n.includes('직접 입력')));

  // 와드네 헬름 경로: 고급→레어 다음 단계는 방어력 +110, 추가피해 +30
  const helm = catalog.find((a) => a.id === 'path-wadne-helm');
  assert.deepEqual(helm.steps[3].gain, { def: 110, addDmg: 30 });
  assert.match(helm.steps[5].label, /에리우 제작/);
  assert.equal(helm.steps[5].cost.items['루시안의 정수'], 4 + 1);

  const disabled = Object.entries(eq.enable).filter(([, on]) => !on).map(([id]) => id)
    .concat(catalog.filter((a) => a.defaultOff && !eq.enable[a.id]).map((a) => a.id));
  const r = advise({
    stats: { atk: 40000, def: 30000, crit: 300, bal: 160, addDmg: 7000, armorPen: 300, destruction: 10000 },
    dungeon: { id: 't', name: 't', minStats: { atk: 41000, def: 30500 } },
    catalog, prices: {}, progress: eq.progress, disabled,
  });
  const ids = r.plan.map((p) => p.actionId);
  assert.ok(ids.includes('polish-orna-weapon-atk'), '오르나 무기 공격력 연마가 계획에 들어간다');
  assert.ok(!ids.some((id) => id.startsWith('polish-weapon-')), '착용 안 한 에리우 무기는 빠진다');
  const orna = r.plan.find((p) => p.actionId === 'polish-orna-weapon-atk');
  assert.ok(orna.missing.some((n) => n.includes('직접 입력')));
});

test('만크리·만밸런스: 크리 +50, 밸런스 +100을 목표로 계산한다', async () => {
  const app = require('../server');
  const srv = app.listen(0);
  const port = srv.address().port;
  try {
    const ds = await (await fetch(`http://localhost:${port}/api/dungeons`)).json();
    const d = ds.find((x) => x.minStats.crit && x.minStats.bal);
    assert.equal(d.capStats.crit, d.minStats.crit + 50);
    assert.equal(d.capStats.bal, d.minStats.bal + 100);
    const stats = { ...d.minStats };
    const post = (goal) => fetch(`http://localhost:${port}/api/advise`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stats, dungeonId: d.id, progress: {}, disabled: [], opts: { goal } }),
    }).then((r) => r.json());
    const entry = await post({});
    assert.equal(entry.diagnosis.pass, true);
    const cap = await post({ critCap: true, balCap: true });
    const row = (k) => cap.diagnosis.rows.find((x) => x.stat === k);
    assert.equal(row('crit').gap, 50);
    assert.equal(row('bal').gap, 100);
    assert.equal(cap.entryStats.crit, d.minStats.crit);
  } finally { srv.close(); }
});
