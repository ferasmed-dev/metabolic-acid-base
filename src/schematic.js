// Schematic: a pH–HCO₃⁻ (Davenport) diagram with pCO₂ isobars, the normal box and the patient's path,
// a gamblegram (cations vs anions, so the anion gap is visible as a block), and lung / kidney indicators.
let trail = [], trailKey = '';

export function drawSchematic(box, e, pt, tr) {
  const g = pt.g;
  const key = e.key;
  if (key !== trailKey || (trail.length && pt.t < trail[trail.length - 1].t)) { trail = []; trailKey = key; }
  if (!trail.length || pt.t > trail[trail.length - 1].t) trail.push({ t: pt.t, ph: g.ph, hco3: g.hco3 });
  if (trail.length > 400) trail = trail.filter((_, i) => i % 2 === 0);

  // Davenport axes
  const X0 = 56, X1 = 380, Y0 = 228, Y1 = 22, PH0 = 6.8, PH1 = 7.7, H1 = 45;
  const x = (ph) => X0 + (Math.min(PH1, Math.max(PH0, ph)) - PH0) / (PH1 - PH0) * (X1 - X0);
  const y = (h) => Y0 - Math.min(H1, Math.max(0, h)) / H1 * (Y0 - Y1);
  const iso = (pco2) => {
    const pts = [];
    for (let ph = PH0; ph <= PH1 + 1e-9; ph += 0.02) {
      const h = 0.03 * pco2 * 10 ** (ph - 6.1);
      if (h <= H1) pts.push(`${x(ph).toFixed(1)},${y(h).toFixed(1)}`);
    }
    return pts;
  };
  const isoLine = (p, strong) => {
    const pts = iso(p);
    const [lx, ly] = pts[pts.length - 1].split(',');
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--axis)" stroke-width="${strong ? 1.6 : 1}" stroke-dasharray="${strong ? '' : '4 3'}"/>
      <text x="${+lx + 4}" y="${+ly + 4}" style="font-size:11px">${p}</text>`;
  };
  const ticksX = [6.9, 7.1, 7.3, 7.4, 7.5, 7.7].map(v => `<line x1="${x(v)}" y1="${Y0}" x2="${x(v)}" y2="${Y0 + 4}" stroke="var(--axis)"/><text x="${x(v)}" y="${Y0 + 16}" text-anchor="middle" style="font-size:11px">${v.toFixed(1)}</text>`).join('');
  const ticksY = [0, 12, 24, 36].map(v => `<line x1="${X0 - 4}" y1="${y(v)}" x2="${X0}" y2="${y(v)}" stroke="var(--axis)"/><text x="${X0 - 7}" y="${y(v) + 4}" text-anchor="end" style="font-size:11px">${v}</text>`).join('');
  const path = trail.map(p => `${x(p.ph).toFixed(1)},${y(p.hco3).toFixed(1)}`).join(' ');
  // expected-compensation band for the current HCO3 (Winter in acidosis, +0.7 in alkalosis)
  const band = [];
  for (let h = 4; h <= 44; h += 1) {
    const pc = h < 24 ? 1.5 * h + 8 : 40 + 0.7 * (h - 24);
    band.push(`${x(6.1 + Math.log10(h / (0.03 * pc))).toFixed(1)},${y(h).toFixed(1)}`);
  }

  // gamblegram
  const GX = 440, GW = 54, GB = 228, s = 1.4;
  const cl = Math.max(0, g.cl), hco3 = Math.max(0, g.hco3), ag = Math.max(0, 140 - cl - hco3);
  const agHot = ag > 16;
  const seg = (x0, from, h, fill, label, hot) => h <= 0 ? '' : `
    <rect x="${x0}" y="${GB - (from + h) * s}" width="${GW}" height="${Math.max(0, h * s - 2)}" rx="3" fill="${fill}" stroke="${hot ? 'var(--hot)' : 'none'}" stroke-width="2"/>
    ${h * s > 15 ? `<text x="${x0 + GW / 2}" y="${GB - (from + h / 2) * s + 4}" text-anchor="middle" style="font-size:11px;font-weight:700;fill:var(--ink)">${label}</text>` : ''}`;

  // lungs / kidney
  const lungTxt = g.pco2 < 37 ? tr('schem.hiper') : g.pco2 > 43 ? tr('schem.hipo') : '';
  const kidHot = e.group === 'agn' || key === 'uremica' || e.group === 'alc';

  box.innerHTML = `
<svg viewBox="0 0 700 260" role="img" aria-label="${tr('schem.aria')}">
  <rect x="${x(7.35)}" y="${y(26)}" width="${x(7.45) - x(7.35)}" height="${y(22) - y(26)}" fill="var(--ok)" opacity="0.25" stroke="var(--ok)"/>
  <text x="${x(7.4)}" y="${y(26) - 5}" text-anchor="middle" style="font-size:11px">${tr('schem.normal')}</text>
  ${[20, 60].map(p => isoLine(p, false)).join('')}${isoLine(40, true)}
  <polyline points="${band.join(' ')}" fill="none" stroke="var(--s1)" stroke-width="5" opacity="0.18"/>
  <line x1="${X0}" y1="${Y0}" x2="${X1}" y2="${Y0}" stroke="var(--axis)"/><line x1="${X0}" y1="${Y0}" x2="${X0}" y2="${Y1}" stroke="var(--axis)"/>
  ${ticksX}${ticksY}
  <text x="${(X0 + X1) / 2}" y="${Y0 + 30}" text-anchor="middle" style="font-size:12px">pH</text>
  <text x="14" y="${(Y0 + Y1) / 2}" text-anchor="middle" transform="rotate(-90 14 ${(Y0 + Y1) / 2})" style="font-size:12px">HCO₃⁻ (mEq/L)</text>
  <text x="${X1 + 22}" y="${Y0 + 30}" text-anchor="end" style="font-size:11px">${tr('schem.isobara')} (mmHg): 20 · 40 · 60</text>
  <text x="${X0 + 8}" y="${Y1 + 4}" style="font-size:11px;fill:var(--s1)">— ${tr('schem.winter')}</text>
  ${trail.length > 1 ? `<polyline points="${path}" fill="none" stroke="var(--hot)" stroke-width="2" stroke-linejoin="round" opacity="0.7"/>` : ''}
  <circle cx="${x(g.ph)}" cy="${y(g.hco3)}" r="7" fill="var(--hot)" stroke="var(--surface)" stroke-width="2"/>

  <text x="${GX + GW / 2}" y="16" text-anchor="middle" style="font-size:12px">${tr('schem.cationes')}</text>
  <text x="${GX + GW + 14 + GW / 2}" y="16" text-anchor="middle" style="font-size:12px">${tr('schem.aniones')}</text>
  ${seg(GX, 0, 140, 'var(--cyst)', 'Na⁺ 140', false)}
  ${seg(GX + GW + 14, 0, cl, 'var(--cyst)', `Cl⁻ ${Math.round(cl)}`, false)}
  ${seg(GX + GW + 14, cl, hco3, 'var(--band)', `HCO₃⁻ ${Math.round(hco3)}`, false)}
  ${seg(GX + GW + 14, cl + hco3, ag, agHot ? 'var(--hot-bg)' : 'var(--grid)', `${tr('schem.ag')} ${Math.round(ag)}`, agHot)}
  <text x="${GX + GW + 7}" y="${GB + 16}" text-anchor="middle" class="${agHot ? 'lbl-on' : ''}">${tr('schem.ag')} = Na − (Cl + HCO₃)</text>

  <g transform="translate(600 40)">
    <path d="M18 0 v14 M18 14 q-14 2 -16 26 q0 14 10 12 q8 -2 6 -24 M18 14 q14 2 16 26 q0 14 -10 12 q-8 -2 -6 -24" fill="var(--tissue)" stroke="${lungTxt ? 'var(--hot)' : 'var(--tissue-line)'}" stroke-width="2"/>
    <text x="18" y="70" text-anchor="middle" class="${lungTxt ? 'lbl-on' : ''}">${tr('schem.pulmon')}</text>
    <text x="18" y="86" text-anchor="middle" style="font-size:11px">pCO₂ ${Math.round(g.pco2)}</text>
    ${lungTxt ? `<text x="18" y="100" text-anchor="middle" style="font-size:11px;fill:var(--hot)">${lungTxt}</text>` : ''}
  </g>
  <g transform="translate(600 150)">
    <path d="M24 2 q-22 0 -22 24 q0 24 22 24 q8 0 8 -10 q-6 -4 -6 -14 q0 -10 6 -14 q0 -10 -8 -10z" fill="var(--tissue)" stroke="${kidHot ? 'var(--hot)' : 'var(--tissue-line)'}" stroke-width="2"/>
    <text x="18" y="68" text-anchor="middle" class="${kidHot ? 'lbl-on' : ''}">${tr('schem.rinon')}</text>
    <text x="18" y="84" text-anchor="middle" style="font-size:11px">K⁺ ${g.k.toFixed(1)}</text>
  </g>
</svg>`;
}
