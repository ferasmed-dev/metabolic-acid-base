// Metabolic acid–base disorders simulator — pure model (no DOM).
// pH from Henderson–Hasselbalch; respiratory compensation approaches its expected pCO2 with a lag.
// Values marked "Model" are teaching assumptions tuned to the textbook course.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Henderson–Hasselbalch: pH = 6.1 + log10(HCO3 / (0.03 · pCO2)). */
export const phFrom = (hco3, pco2) => 6.1 + Math.log10(Math.max(hco3, 1) / (0.03 * Math.max(pco2, 5)));
/** Expected pCO2: Winter in metabolic acidosis (1.5·HCO3 + 8); +0.7 mmHg per mEq/L of HCO3 above 24 in alkalosis. */
export const expectedPco2 = (hco3) => (hco3 < 24 ? 1.5 * hco3 + 8 : 40 + 0.7 * (hco3 - 24));
/** Anion gap = Na − (Cl + HCO3). */
export const anionGap = (na, cl, hco3) => na - (cl + hco3);
/** Albumin-corrected AG: +2.5 per g/dL below 4.5. */
export const agCorr = (ag, alb) => ag + 2.5 * Math.max(0, 4.5 - alb);

export const GAUGES = {
  ph: { unit: '', dec: 2, normal: [7.35, 7.45] },
  hco3: { unit: 'mEq/L', dec: 0, normal: [22, 26], yMin: 0 },
  pco2: { unit: 'mmHg', dec: 0, normal: [35, 45] },
  ag: { unit: 'mEq/L', dec: 0, normal: [8, 16] },
  agu: { unit: 'mEq/L', dec: 0, normal: null, neg: true },
  k: { unit: 'mEq/L', dec: 1, normal: [3.5, 5.0] },
  cl: { unit: 'mEq/L', dec: 0, normal: [98, 106] },
  lactato: { unit: 'mmol/L', dec: 1, normal: [0.5, 2], yMin: 0 },
  hiato: { unit: 'mOsm/kg', dec: 0, normal: [0, 10] },
  ucl: { unit: 'mEq/L', dec: 0, normal: null, yMin: 0 },
  pas: { unit: 'mmHg', dec: 0, normal: [100, 139] },
  phu: { unit: '', dec: 1, normal: null },
  mg: { unit: 'mg/dL', dec: 1, normal: [1.7, 2.4] },
};

const R = (key, min, max, step, def, unit = '', dec = 0) => ({ key, min, max, step, def, unit, dec });
const Ch = (key, options, def) => ({ key, type: 'choice', options, def });

export const ENTITIES = [
  { key: 'diarrea', group: 'agn', unit: 'days', tMax: 5, dt: 0.05, treat: true, tauC: 0.5,
    params: [R('perdidas', 50, 400, 25, 200, 'mEq/24 h')],
    tiles: ['ph', 'hco3', 'pco2', 'ag', 'agu', 'k'], charts: ['ph', 'hco3'],
    steps: ['perdida_hco3', 'hipercloremia', 'nh4', 'compensacion', 'tto'] },
  { key: 'atr', group: 'agn', unit: 'days', tMax: 30, dt: 0.25, treat: true, tauC: 0.5,
    params: [Ch('tipo', ['i', 'ii', 'iv'], 'i')],
    tiles: ['ph', 'hco3', 'k', 'agu', 'phu'], charts: ['hco3', 'k'],
    steps: ['defecto', 'acidosis', 'agu_pos', 'potasio', 'calcio', 'tto'] },
  { key: 'cetoacidosis', group: 'aga', unit: 'hours', tMax: 24, dt: 0.1, treat: true, tauC: 6,
    params: [R('gravedad', 1, 10, 1, 7, '')],
    tiles: ['ph', 'hco3', 'pco2', 'ag', 'k'], charts: ['ph', 'ag'],
    steps: ['insulina', 'cetoacidos', 'ag_alto', 'compensacion', 'potasio', 'tto'] },
  { key: 'lactica', group: 'aga', unit: 'hours', tMax: 24, dt: 0.1, treat: true, tauC: 6,
    params: [R('lactato0', 2, 15, 0.5, 8, 'mmol/L', 1), R('inicio', 0, 8, 0.5, 1, 'h', 1)],
    tiles: ['ph', 'hco3', 'lactato', 'ag'], charts: ['ph', 'lactato'],
    steps: ['hipoperfusion', 'lactato', 'ag_alto', 'compensacion', 'causa', 'bicarbonato'] },
  { key: 'uremica', group: 'aga', unit: 'months', tMax: 12, dt: 0.1, treat: true, tauC: 0.02,
    params: [R('fg', 5, 40, 1, 15, 'mL/min')],
    tiles: ['ph', 'hco3', 'ag', 'k'], charts: ['hco3', 'ph'],
    steps: ['fg_bajo', 'amoniogenesis', 'aniones', 'hueso', 'tto'] },
  { key: 'toxicos', group: 'aga', unit: 'hours', tMax: 24, dt: 0.1, treat: true, tauC: 6,
    params: [Ch('toxico', ['metanol', 'etilenglicol', 'salicilatos'], 'metanol'), R('dosis', 1, 10, 1, 6, '')],
    tiles: ['ph', 'hco3', 'pco2', 'ag', 'hiato'], charts: ['ag', 'hiato'],
    steps: ['ingesta', 'hiato', 'metabolitos', 'ag_alto', 'mixto', 'tto'] },
  { key: 'alc_cl_sensible', group: 'alc', unit: 'days', tMax: 7, dt: 0.05, treat: true, tauC: 0.5,
    params: [Ch('causa', ['vomitos', 'diureticos'], 'vomitos'), R('intensidad', 1, 10, 1, 6, '')],
    tiles: ['ph', 'hco3', 'pco2', 'k', 'cl', 'ucl'], charts: ['hco3', 'k'],
    steps: ['generacion', 'contraccion', 'hipok', 'perpetuacion', 'hipoventilacion', 'tto'] },
  { key: 'alc_cl_resistente', group: 'alc', unit: 'days', tMax: 30, dt: 0.25, treat: true, tauC: 0.5,
    params: [Ch('causa', ['hiperaldo', 'cushing', 'regaliz'], 'hiperaldo')],
    tiles: ['ph', 'hco3', 'k', 'pas', 'ucl'], charts: ['hco3', 'pas'],
    steps: ['mineralocorticoide', 'na_distal', 'hipok', 'hta', 'tto'] },
  { key: 'bartter_gitelman', group: 'alc', unit: 'days', tMax: 30, dt: 0.25, treat: true, tauC: 0.5,
    params: [Ch('tipo', ['bartter', 'gitelman'], 'bartter')],
    tiles: ['ph', 'hco3', 'k', 'mg', 'pas'], charts: ['k', 'hco3'],
    steps: ['transportador', 'perdida_sal', 'sraa', 'hipok', 'normotension', 'tto'] },
];

export function defaults(key) {
  const e = ENTITIES.find(x => x.key === key);
  return Object.fromEntries(e.params.map(p => [p.key, p.def]));
}

function runner(e, init, step) {
  const points = [], events = [], fired = new Set();
  const emit = (t, key, args = []) => { if (fired.has(key)) return; fired.add(key); events.push({ t, key, args }); };
  const st = { pco2: 40, ...init };
  const n = Math.round(e.tMax / e.dt);
  for (let i = 0; i <= n; i++) {
    const t = +(i * e.dt).toFixed(6);
    const o = step(st, t, e.dt, emit);
    // respiratory compensation lags towards its expected value (+ any primary respiratory offset)
    const target = clamp(expectedPco2(o.hco3) + (o.respOffset || 0), 15, 60);
    st.pco2 = i === 0 && o.startCompensated ? target : st.pco2 + (target - st.pco2) * Math.min(1, e.dt / e.tauC);
    const na = 140;
    const cl = o.cl ?? (na - o.hco3 - (12 + (o.extraAG || 0)));
    const ag = anionGap(na, cl, o.hco3);
    const ph = phFrom(o.hco3, st.pco2);
    if (ph < 7.2) emit(t, 'acidemia_grave');
    if (ph > 7.55) emit(t, 'alcalemia_grave');
    const g = { ph, hco3: o.hco3, pco2: st.pco2, ag, cl, k: 4.2, agu: -20, lactato: 1, hiato: 4, ucl: 60, pas: 120, phu: 6, mg: 2, ...o.g };
    for (const k of Object.keys(g)) g[k] = Number.isFinite(g[k]) ? (k === 'agu' ? g[k] : Math.max(0, g[k])) : 0;
    points.push({ t, g, active: o.active, lesion: clamp(Math.abs(ph - 7.4) / 0.35, 0, 1), badge: o.badge || null });
  }
  return { points, events };
}
const E = (k) => ENTITIES.find(x => x.key === k);
const approach = (v, target, dt, tau) => v + (target - v) * Math.min(1, dt / tau);

const MODELS = {
  // Diarrhoea: intestinal HCO3 loss → hyperchloraemic acidosis with normal AG; the kidney raises NH4⁺
  // excretion, so the urinary AG is negative. Rehydration + bicarbonate/citrate correct it.
  diarrea(p, treated) {
    const target = 24 - p.perdidas / 20;
    return runner(E('diarrea'), { hco3: 24 }, (s, t, dt, emit) => {
      const on = treated && t >= 1;
      if (on) emit(t, 'tto');
      s.hco3 = approach(s.hco3, on ? 24 : target, dt, on ? 0.6 : 0.8);
      const d = 24 - s.hco3;
      if (d > 4) emit(t, 'acidosis');
      const active = ['perdida_hco3'];
      if (d > 2) active.push('hipercloremia', 'nh4');
      if (d > 2) active.push('compensacion');
      if (on) active.push('tto');
      return { hco3: s.hco3, g: { agu: -10 - 2.5 * d, k: 4.2 - 0.07 * d }, active, badge: d > 4 ? 'ag_normal' : null };
    });
  },

  // Renal tubular acidosis: normal-AG acidosis with positive urinary AG (low NH4⁺).
  // I (distal): cannot acidify urine (pH > 5.5), hypoK, nephrocalcinosis. II (proximal): low HCO3 threshold,
  // urine acidifies once HCO3 is below it, hypoK. IV: aldosterone deficit/resistance → hyperK, urine pH < 5.5.
  atr(p, treated) {
    const cfg = { i: { hco3: 15, k: 3.0, phu: 6.5 }, ii: { hco3: 17, k: 3.2, phu: 5.2 }, iv: { hco3: 18, k: 6.0, phu: 5.2 } }[p.tipo];
    return runner(E('atr'), { hco3: 24, k: 4.2 }, (s, t, dt, emit) => {
      const on = treated && t >= 3;
      if (on) emit(t, p.tipo === 'iv' ? 'tto_iv' : 'tto_alcali');
      s.hco3 = approach(s.hco3, on ? 23 : cfg.hco3, dt, on ? 2 : 1.5);
      s.k = approach(s.k, on ? (p.tipo === 'iv' ? 4.8 : 4.0) : cfg.k, dt, on ? 3 : 1.5);
      if (p.tipo === 'i' && t >= 5 && !on) emit(t, 'nefrocalcinosis');
      if (s.k < 3.5) emit(t, 'hipok');
      if (s.k > 5.5) emit(t, 'hiperk');
      const active = ['defecto'];
      if (s.hco3 < 22) active.push('acidosis', 'agu_pos');
      if (s.k < 3.5 || s.k > 5.0) active.push('potasio');
      if (p.tipo === 'i' && !on) active.push('calcio');
      if (on) active.push('tto');
      return { hco3: s.hco3, g: { k: s.k, agu: 15, phu: on && p.tipo === 'i' ? 6.2 : cfg.phu }, active, badge: `atr_${p.tipo}` };
    });
  },

  // Diabetic ketoacidosis: insulin deficit → ketoacids consume HCO3 and widen the AG; serum K is normal-high
  // despite total-body depletion and falls with insulin. Treatment: fluids + insulin + potassium (standard care).
  cetoacidosis(p, treated) {
    const keto0 = 2 + 2 * p.gravedad;
    return runner(E('cetoacidosis'), { keto: keto0 * 0.4 }, (s, t, dt, emit) => {
      const on = treated && t >= 1;
      if (on) emit(t, 'insulina');
      s.keto = on ? approach(s.keto, 0, dt, 4) : approach(s.keto, keto0, dt, 3);
      const hco3 = 24 - s.keto;
      const k = on ? approach(5.2, 3.9, t - 1, 6) : 4.6 + 0.04 * s.keto;
      if (s.keto > 10) emit(t, 'grave');
      const active = ['insulina', 'cetoacidos'];
      if (s.keto > 4) active.push('ag_alto', 'compensacion');
      active.push('potasio');
      if (on) active.push('tto');
      return { hco3, extraAG: s.keto, g: { k }, startCompensated: true, active, badge: s.keto > 4 ? 'ag_alto' : null };
    });
  },

  // Lactic acidosis: tissue hypoperfusion/hypoxia → lactate (> 2 mild, > 5 severe) replaces HCO3 1:1.
  // Treating the cause clears lactate; IV bicarbonate only if pH < 7.1–7.2 (adds a transient HCO3 rise, Model).
  lactica(p, treated) {
    return runner(E('lactica'), { lac: p.lactato0, bic: 0 }, (s, t, dt, emit) => {
      const on = treated && t >= p.inicio;
      if (on) emit(t, 'causa');
      s.lac = on ? approach(s.lac, 1, dt, 3) : approach(s.lac, p.lactato0 * 1.5, dt, 6);
      let hco3 = Math.max(3, 24 - (s.lac - 1) + s.bic);
      const ph = phFrom(hco3, expectedPco2(hco3));
      if (on && ph < 7.2 && s.bic === 0 && !s.given) { s.bic = 4; s.given = true; emit(t, 'bicarbonato'); hco3 += 4; }
      if (s.bic > 0) s.bic = Math.max(0, s.bic - 0.5 * dt);
      if (s.lac > 5) emit(t, 'grave');
      const active = [];
      if (!on) active.push('hipoperfusion');
      if (s.lac > 2) active.push('lactato', 'ag_alto', 'compensacion');
      if (on) active.push('causa');
      if (s.bic > 0) active.push('bicarbonato');
      return { hco3, extraAG: s.lac - 1, g: { lactato: s.lac }, startCompensated: true, active,
        badge: s.lac > 5 ? 'lactica_grave' : s.lac > 2 ? 'lactica' : null };
    });
  },

  // Uraemic acidosis: low GFR limits ammoniagenesis and retains sulphate/phosphate (AG mildly ↑) → slow HCO3 fall,
  // bone buffering. Oral bicarbonate keeps HCO3 ≥ 22 (KDIGO).
  'uremica'(p, treated) {
    const target = clamp(24 - (40 - p.fg) * 0.35, 12, 24);
    return runner(E('uremica'), { hco3: 23 }, (s, t, dt, emit) => {
      const on = treated && t >= 2;
      if (on) emit(t, 'bicarbonato_oral');
      s.hco3 = approach(s.hco3, on ? 23 : target, dt, 1.5);
      const active = ['fg_bajo', 'amoniogenesis'];
      if (p.fg < 30) active.push('aniones');
      if (s.hco3 < 22 && t > 3) active.push('hueso');
      if (on) active.push('tto');
      return { hco3: s.hco3, extraAG: clamp((30 - p.fg) / 3, 0, 8), g: { k: 4.8 + (p.fg < 15 ? 0.6 : 0) }, startCompensated: true, active,
        badge: s.hco3 < 22 ? 'uremica' : null };
    });
  },

  // Toxic alcohols / salicylates. Methanol and ethylene glycol: high osmolar gap first, then toxic acids widen the AG
  // as they are metabolised. Salicylates: high-AG acidosis + primary respiratory alkalosis (pCO2 below Winter).
  // Treatment (standard): fomepizole/ethanol + haemodialysis for alcohols; urine alkalinisation ± dialysis for salicylates.
  toxicos(p, treated) {
    const sal = p.toxico === 'salicilatos';
    return runner(E('toxicos'), { parent: 10 * p.dosis, acid: 0 }, (s, t, dt, emit) => {
      const on = treated && t >= 2;
      if (on) emit(t, sal ? 'alcalinizar' : 'fomepizol');
      const met = sal ? 0.25 : on ? 0.0 : 0.18;
      const conv = s.parent * met * dt;
      s.parent = Math.max(0, s.parent - conv - (on ? s.parent * 0.4 * dt : 0));
      s.acid = Math.max(0, s.acid + conv * 0.35 - (on ? s.acid * 0.35 * dt : 0.02 * s.acid * dt));
      const hco3 = clamp(24 - s.acid, 4, 24);
      const gap = sal ? 6 : 4 + s.parent * 0.9;
      if (gap > 10) emit(t, 'hiato');
      if (s.acid > 6) emit(t, 'ag');
      const active = ['ingesta'];
      if (gap > 10) active.push('hiato');
      if (s.acid > 1) active.push('metabolitos');
      if (s.acid > 4) active.push('ag_alto');
      if (sal) active.push('mixto');
      if (on) active.push('tto');
      return { hco3, extraAG: s.acid, respOffset: sal ? -8 : 0, g: { hiato: gap }, active,
        badge: gap > 10 ? 'hiato_alto' : s.acid > 4 ? 'ag_alto' : null };
    });
  },

  // Chloride-responsive alkalosis: vomiting/NG suction (urine Cl < 20) or diuretics (urine Cl > 20 while acting).
  // Volume contraction, hypoK and Cl depletion perpetuate it; compensation = hypoventilation.
  // Treatment: 0.9 % saline + KCl.
  alc_cl_sensible(p, treated) {
    const target = 24 + p.intensidad * 1.6;
    return runner(E('alc_cl_sensible'), { hco3: 24, k: 4.2 }, (s, t, dt, emit) => {
      const on = treated && t >= 2;
      if (on) emit(t, 'ss_kcl');
      s.hco3 = approach(s.hco3, on ? 25 : target, dt, on ? 1 : 0.8);
      s.k = approach(s.k, on ? 4.0 : 4.2 - 0.12 * p.intensidad, dt, 1);
      const d = s.hco3 - 24;
      const ucl = p.causa === 'vomitos' ? (on ? 60 : 10) : 50;
      if (d > 4) emit(t, 'alcalosis');
      if (s.k < 3.5) emit(t, 'hipok');
      const active = ['generacion'];
      if (d > 2) active.push('contraccion');
      if (s.k < 3.5) active.push('hipok');
      if (d > 4 && !on) active.push('perpetuacion');
      if (d > 2) active.push('hipoventilacion');
      if (on) active.push('tto');
      return { hco3: s.hco3, cl: 140 - s.hco3 - 12, g: { k: s.k, ucl, pas: on ? 120 : 112 - d }, active,
        badge: d > 4 ? (ucl < 20 ? 'ucl_bajo' : 'ucl_alto') : null };
    });
  },

  // Chloride-resistant alkalosis with HTA: mineralocorticoid excess (primary hyperaldosteronism, severe Cushing,
  // liquorice inhibiting 11β-HSD2) → distal Na reabsorption with K⁺/H⁺ secretion. Treatment: aldosterone antagonist,
  // surgery or stopping liquorice.
  alc_cl_resistente(p, treated) {
    return runner(E('alc_cl_resistente'), { hco3: 24, k: 4.2, pas: 125 }, (s, t, dt, emit) => {
      const on = treated && t >= 5;
      if (on) emit(t, p.causa === 'regaliz' ? 'stop_regaliz' : 'antialdo');
      s.hco3 = approach(s.hco3, on ? 25 : 32, dt, 3);
      s.k = approach(s.k, on ? 4.2 : 2.9, dt, 3);
      s.pas = approach(s.pas, on ? 130 : 165, dt, 3);
      if (s.k < 3.5) emit(t, 'hipok');
      const active = ['mineralocorticoide', 'na_distal'];
      if (s.k < 3.5) active.push('hipok');
      if (s.pas >= 140) active.push('hta');
      if (on) active.push('tto');
      return { hco3: s.hco3, cl: 140 - s.hco3 - 12, g: { k: s.k, pas: s.pas, ucl: 60 }, active, badge: s.pas >= 140 ? 'hta' : null };
    });
  },

  // Bartter (thick ascending limb, NKCC2/ClC-Kb) and Gitelman (distal convoluted tubule, NCC): salt wasting
  // → volume contraction → RAAS → hypoK metabolic alkalosis with normal BP. Gitelman: severe hypoMg, hypocalciuria.
  // Treatment: K and Mg supplements; NSAIDs and aldosterone antagonists in Bartter.
  bartter_gitelman(p, treated) {
    const b = p.tipo === 'bartter';
    return runner(E('bartter_gitelman'), { hco3: 24, k: 4.2, mg: 2 }, (s, t, dt, emit) => {
      const on = treated && t >= 5;
      if (on) emit(t, b ? 'tto_bartter' : 'tto_gitelman');
      s.hco3 = approach(s.hco3, on ? 27 : (b ? 32 : 30), dt, 3);
      s.k = approach(s.k, on ? 3.6 : (b ? 2.3 : 2.8), dt, 3);
      s.mg = approach(s.mg, on ? 1.8 : (b ? 1.7 : 1.1), dt, 3);
      if (s.k < 3.5) emit(t, 'hipok');
      if (s.mg < 1.4) emit(t, 'hipomg');
      const active = ['transportador', 'perdida_sal', 'sraa'];
      if (s.k < 3.5) active.push('hipok');
      active.push('normotension');
      if (on) active.push('tto');
      return { hco3: s.hco3, cl: 140 - s.hco3 - 12, g: { k: s.k, mg: s.mg, pas: 110, ucl: 70 }, active, badge: b ? 'bartter' : 'gitelman' };
    });
  },
};

export function simulate(key, params, treated = false) {
  const e = ENTITIES.find(x => x.key === key);
  if (!e) throw new Error(`unknown entity ${key}`);
  const p = { ...defaults(key), ...params };
  return MODELS[key](p, treated && e.treat);
}

export const PRESETS = {
  colera: { entity: 'diarrea', params: { perdidas: 300 } },
  atr_distal_sjogren: { entity: 'atr', params: { tipo: 'i' } },
  atr_proximal_fanconi: { entity: 'atr', params: { tipo: 'ii' } },
  atr_iv_diabetico: { entity: 'atr', params: { tipo: 'iv' } },
  cad_debut: { entity: 'cetoacidosis', params: { gravedad: 8 } },
  shock_septico: { entity: 'lactica', params: { lactato0: 9, inicio: 1 } },
  shock_tardio: { entity: 'lactica', params: { lactato0: 15, inicio: 6 } },
  erc_avanzada: { entity: 'uremica', params: { fg: 12 } },
  metanol: { entity: 'toxicos', params: { toxico: 'metanol', dosis: 7 } },
  salicilatos: { entity: 'toxicos', params: { toxico: 'salicilatos', dosis: 6 } },
  vomitos_estenosis: { entity: 'alc_cl_sensible', params: { causa: 'vomitos', intensidad: 7 } },
  diureticos: { entity: 'alc_cl_sensible', params: { causa: 'diureticos', intensidad: 5 } },
  conn: { entity: 'alc_cl_resistente', params: { causa: 'hiperaldo' } },
  regaliz: { entity: 'alc_cl_resistente', params: { causa: 'regaliz' } },
  bartter_nino: { entity: 'bartter_gitelman', params: { tipo: 'bartter' } },
  gitelman_adulto: { entity: 'bartter_gitelman', params: { tipo: 'gitelman' } },
};
