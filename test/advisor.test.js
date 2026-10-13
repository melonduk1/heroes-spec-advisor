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
