import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTITIES, GAUGES, PRESETS, simulate, defaults, phFrom, expectedPco2, anionGap, agCorr } from '../src/model.js';
import { STR } from '../src/i18n.js';

const last = r => r.points[r.points.length - 1];
const at = (r, t) => r.points.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
const min = (r, g) => Math.min(...r.points.map(p => p.g[g]));
const max = (r, g) => Math.max(...r.points.map(p => p.g[g]));
const evs = r => r.events.map(e => e.key);

/* ---------- generic: every entity ---------- */
for (const e of ENTITIES) {
  test(`${e.key}: well-formed output (defaults, extremes, both arms)`, () => {
    const variants = [defaults(e.key)];
    for (const p of e.params.filter(q => q.type !== 'choice')) {
      variants.push({ ...defaults(e.key), [p.key]: p.min }, { ...defaults(e.key), [p.key]: p.max });
    }
    for (const p of e.params.filter(q => q.type === 'choice')) for (const o of p.options) variants.push({ ...defaults(e.key), [p.key]: o });
    for (const v of variants) for (const tr of [false, true]) {
      const r = simulate(e.key, v, tr);
      assert.equal(r.points.length, Math.round(e.tMax / e.dt) + 1);
      for (let i = 1; i < r.points.length; i++) assert.ok(r.points[i].t > r.points[i - 1].t);
      for (const pt of r.points) {
        for (const g of [...e.tiles, ...e.charts]) {
          assert.ok(Number.isFinite(pt.g[g]) && (pt.g[g] >= 0 || GAUGES[g].neg), `${e.key} ${g}=${pt.g[g]}`);
          assert.ok(GAUGES[g], `gauge ${g} defined`);
        }
        for (const a of pt.active) assert.ok(e.steps.includes(a), `${e.key} unknown step ${a}`);
        assert.ok(pt.lesion >= 0 && pt.lesion <= 1);
      }
      for (const ev of r.events) assert.ok(ev.t >= 0 && ev.t <= e.tMax);
    }
  });
}

test('pure: same input → same output, params not mutated', () => {
  for (const e of ENTITIES) {
    const p = defaults(e.key); const copy = JSON.stringify(p);
    assert.deepEqual(simulate(e.key, p, true), simulate(e.key, p, true));
    assert.equal(JSON.stringify(p), copy);
  }
});

test('Henderson–Hasselbalch: HCO3 24 / pCO2 40 → pH 7.40; Winter and alkalosis compensation; AG', () => {
  assert.ok(Math.abs(phFrom(24, 40) - 7.40) < 0.005);
  assert.equal(expectedPco2(12), 26);
  assert.ok(Math.abs(expectedPco2(34) - 47) < 1e-9);
  assert.equal(anionGap(140, 104, 24), 12);
  assert.equal(agCorr(12, 2.5), 17);
});

test('i18n: every key used by the model exists in ES and EN', () => {
  for (const lang of ['es', 'en']) {
    const S = STR[lang];
    for (const e of ENTITIES) {
      const E = S.ent[e.key];
      for (const f of ['name', 'what', 'params', 'sees', 'tto']) assert.ok(E[f], `${lang} ${e.key}.${f}`);
      for (const st of e.steps) assert.ok(E.steps[st], `${lang} step ${e.key}.${st}`);
      for (const p of e.params) {
        assert.ok(S.params[p.key], `${lang} param ${p.key}`);
        if (p.type === 'choice') for (const o of p.options) assert.ok(S.choice[p.key][o], `${lang} choice ${p.key}.${o}`);
      }
      for (const g of [...e.tiles, ...e.charts]) assert.ok(S.gauges[g], `${lang} gauge ${g}`);
      assert.ok(S.units[e.unit]);
      for (const tr of [false, true]) {
        const r = simulate(e.key, defaults(e.key), tr);
        for (const ev of r.events) assert.equal(typeof S.ev[ev.key], 'function', `${lang} event ${ev.key}`);
        for (const pt of r.points) if (pt.badge) assert.ok(S.badge[pt.badge], `${lang} badge ${pt.badge}`);
      }
    }
    for (const k of Object.keys(PRESETS)) assert.ok(S.presets[k], `${lang} preset ${k}`);
  }
});

/* ---------- presets ---------- */
test('presets reference valid entities and parameters', () => {
  for (const [k, pr] of Object.entries(PRESETS)) {
    const e = ENTITIES.find(x => x.key === pr.entity);
    assert.ok(e, k);
    for (const pk of Object.keys(pr.params)) assert.ok(e.params.some(p => p.key === pk), `${k}.${pk}`);
    for (const ev of [...simulate(pr.entity, pr.params, false).events, ...simulate(pr.entity, pr.params, true).events]) {
      assert.equal(typeof STR.es.ev[ev.key], 'function', `${k} event ${ev.key}`);
    }
  }
});

/* ---------- mechanisms ---------- */
const ev = (r, k) => r.events.find(e => e.key === k);
const winterOk = (g) => Math.abs(g.pco2 - (1.5 * g.hco3 + 8)) <= 2;

test('diarrhoea: normal-AG hyperchloraemic acidosis with negative urinary AG; compensated by Winter', () => {
  const u = simulate('diarrea', PRESETS.colera.params, false), g = last(u).g;
  assert.ok(g.ph < 7.3 && g.hco3 < 12 && g.ag <= 13 && g.cl > 110 && g.agu < 0);
  assert.ok(winterOk(g));
  assert.ok(last(simulate('diarrea', PRESETS.colera.params, true)).g.ph > 7.35);
});

test('RTA: positive urinary AG; type I urine pH > 5.5 and hypoK, type II hypoK, type IV hyperK', () => {
  const g = (t, tr = false) => last(simulate('atr', { tipo: t }, tr)).g;
  for (const t of ['i', 'ii', 'iv']) { assert.ok(g(t).agu > 0 && g(t).ag <= 13 && g(t).hco3 < 20); }
  assert.ok(g('i').phu > 5.5 && g('ii').phu < 5.5 && g('iv').phu < 5.5);
  assert.ok(g('i').k < 3.5 && g('ii').k < 3.5 && g('iv').k > 5.5);
  assert.ok(g('i').hco3 < g('ii').hco3, 'distal RTA is the more severe acidosis');
  assert.ok(ev(simulate('atr', { tipo: 'i' }), 'nefrocalcinosis'));
  for (const t of ['i', 'ii', 'iv']) assert.ok(g(t, true).hco3 >= 22);
  assert.ok(g('iv', true).k < 5.5);
});

test('ketoacidosis: high-AG acidosis; insulin closes the gap and serum K falls', () => {
  const u = simulate('cetoacidosis', PRESETS.cad_debut.params, false);
  assert.ok(last(u).g.ag > 25 && last(u).g.ph < 7.2 && winterOk(last(u).g));
  const t = simulate('cetoacidosis', PRESETS.cad_debut.params, true);
  assert.ok(last(t).g.ag < 14 && last(t).g.ph > 7.35);
  assert.ok(last(t).g.k < at(t, 1).g.k);
});

test('lactic acidosis: lactate > 5 is severe; treating the cause clears it; bicarbonate only when pH < 7.2', () => {
  const s = simulate('lactica', PRESETS.shock_septico.params, true);
  assert.ok(last(s).g.lactato < 2 && !ev(s, 'bicarbonato'));
  const late = simulate('lactica', PRESETS.shock_tardio.params, true);
  assert.ok(ev(late, 'bicarbonato') && ev(late, 'bicarbonato').t >= 6);
  assert.ok(last(simulate('lactica', PRESETS.shock_tardio.params, false)).g.ph < last(late).g.ph);
  assert.equal(simulate('lactica', { lactato0: 9 }).points[0].badge, 'lactica_grave');
});

test('uraemic acidosis: lower GFR → lower HCO3 and mildly high AG; oral bicarbonate keeps HCO3 ≥ 22', () => {
  assert.ok(last(simulate('uremica', { fg: 8 })).g.hco3 < last(simulate('uremica', { fg: 30 })).g.hco3);
  const g = last(simulate('uremica', PRESETS.erc_avanzada.params)).g;
  assert.ok(g.ag > 14 && g.ag < 22);
  assert.ok(last(simulate('uremica', PRESETS.erc_avanzada.params, true)).g.hco3 >= 22);
});

test('toxic alcohols: osmolar gap first, then high AG; salicylates add a respiratory alkalosis (pCO2 below Winter)', () => {
  const m = simulate('toxicos', PRESETS.metanol.params, false);
  assert.ok(m.points[0].g.hiato > 10 && m.points[0].g.ag < 14);
  assert.ok(ev(m, 'hiato').t < ev(m, 'ag').t && max(m, 'ag') > 25);
  assert.ok(max(simulate('toxicos', PRESETS.metanol.params, true), 'ag') < max(m, 'ag'));
  const s = last(simulate('toxicos', PRESETS.salicilatos.params, false)).g;
  assert.ok(s.pco2 < 1.5 * s.hco3 + 8 - 2 && s.hiato < 10);
});

test('chloride-responsive alkalosis: urine Cl < 20 with vomiting, > 20 with diuretics; hypoventilation; saline + KCl correct it', () => {
  const v = last(simulate('alc_cl_sensible', PRESETS.vomitos_estenosis.params)).g;
  assert.ok(v.ph > 7.45 && v.hco3 > 30 && v.ucl < 20 && v.k < 3.5 && v.pco2 > 44);
  assert.ok(last(simulate('alc_cl_sensible', PRESETS.diureticos.params)).g.ucl > 20);
  assert.ok(last(simulate('alc_cl_sensible', PRESETS.vomitos_estenosis.params, true)).g.hco3 < 27);
});

test('chloride-resistant alkalosis: hypertension and hypoK; aldosterone antagonist / stopping liquorice reverse them', () => {
  const u = last(simulate('alc_cl_resistente', PRESETS.conn.params)).g;
  assert.ok(u.pas >= 160 && u.k < 3 && u.hco3 > 30 && u.ucl > 20);
  const t = last(simulate('alc_cl_resistente', PRESETS.regaliz.params, true)).g;
  assert.ok(t.pas < 140 && t.k > 3.5);
});

test('Bartter vs Gitelman: both normotensive hypoK alkalosis; Gitelman has the low Mg', () => {
  const b = last(simulate('bartter_gitelman', { tipo: 'bartter' })).g, gi = last(simulate('bartter_gitelman', { tipo: 'gitelman' })).g;
  assert.ok(b.pas < 130 && gi.pas < 130 && b.hco3 > 28 && gi.hco3 > 28);
  assert.ok(b.k < gi.k, 'Bartter is the more severe');
  assert.ok(gi.mg < 1.4 && b.mg >= 1.6);
  assert.ok(last(simulate('bartter_gitelman', { tipo: 'gitelman' }, true)).g.k > gi.k);
});
