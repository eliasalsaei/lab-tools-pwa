// Seawater RO simulator engine: solution–diffusion transport, film-model
// concentration polarisation, element-by-element (segmented) solution along a
// pressure vessel. All vessels in a stage are identical, so one vessel is
// solved and multiplied out.
//
// Units: flow m³/h (internally), flux L/m²/h (LMH), pressure bar,
// concentration mg/L, temperature °C, power kW.
import { TEST, getMembrane } from './membranes.js';

const SEGMENTS = 5;           // sub-segments per element
const K_DP = 0.0065;          // element pressure-drop coefficient: ΔP = K·Qavg^1.75
const K_MT_REF = 430;         // mass-transfer coefficient (LMH) at reference crossflow
const Q_MT_REF = 12.8;        // reference average feed-channel flow (m³/h)
const CL_FRACTION = 0.553;    // chloride share of seawater TDS
const TDS_PER_US = 0.5;       // mg/L per µS/cm for dilute NaCl permeate

// Osmotic pressure (bar) ≈ 0.79 bar per 1000 mg/L at 25 °C, van 't Hoff in T.
export function osmotic(tds, temp) {
  return 7.9e-4 * tds * (temp + 273.15) / 298.15;
}

// Temperature correction factors (Arrhenius form, referenced to 25 °C).
function tcf(temp, e) {
  return Math.exp(e * (1 / 298.15 - 1 / (temp + 273.15)));
}
export const tcfWater = (t) => tcf(t, t >= 25 ? 2640 : 3020);
const tcfSalt = (t) => tcf(t, 4000);
const tcfBoron = (t) => tcf(t, 5000);

// Boric acid pKa falls with salinity and temperature (≈8.6–8.7 in seawater).
export function boricPka(tds, temp) {
  return 9.24 - 0.62 * Math.sqrt(Math.max(tds, 0) / 35000) - 0.008 * (temp - 25);
}

export function borateFraction(ph, tds, temp) {
  return 1 / (1 + 10 ** (boricPka(tds, temp) - ph));
}

// Solve one segment of membrane area `a` (m²). Returns permeate + outlet state.
function solveSegment(s, a, perm) {
  const { Qf, C, Cb: CBf, P } = s;
  let Jw = 15;
  let r;
  for (let i = 0; i < 60; i++) {
    const Qp = Jw * a / 1000;
    const Qc = Math.max(Qf - Qp, 1e-6);
    const Qavg = (Qf + Qc) / 2;
    const k = K_MT_REF * Math.sqrt(Qavg / Q_MT_REF);
    const beta = Math.exp(Jw / k);
    // Bulk concentration approximated by the in/out mean; permeate is tiny.
    const Cout = Qf * C / Qc;
    const Cbulk = (C + Cout) / 2;
    const Cm = beta * Cbulk;
    const Cp = perm.B * Cm / (Jw + perm.B);
    const dp = K_DP * Qavg ** 1.75 / SEGMENTS * perm.dpFactor;
    const ndp = P - dp / 2 - perm.Pp - (osmotic(Cm, perm.T) - osmotic(Cp, perm.T));
    const Jnew = Math.max(perm.A * ndp, 0);
    const done = Math.abs(Jnew - Jw) < 1e-6;
    Jw = 0.5 * Jw + 0.5 * Jnew;
    r = { Jw, Qp, Qc, Qavg, beta, Cm, Cp, dp, ndp, Cbulk };
    if (done) break;
  }
  const Qp = Jw * a / 1000;
  const Qc = Math.max(Qf - Qp, 1e-6);
  const CmB = r.beta * (CBf + Qf * CBf / Qc) / 2;
  const CpB = perm.Bb * CmB / (Jw + perm.Bb);
  return {
    ...r,
    Qp,
    CpB,
    out: {
      Qf: Qc,
      C: (Qf * C - Qp * r.Cp) / Qc,
      Cb: (Qf * CBf - Qp * CpB) / Qc,
      P: P - r.dp,
    },
  };
}

// Solve one pressure vessel of `n` elements in series.
function solveVessel(feed, n, area, perm) {
  let s = { ...feed };
  const elements = [];
  for (let e = 0; e < n; e++) {
    const inlet = s;
    let Qp = 0, salt = 0, boron = 0, betaMax = 0, ndpSum = 0;
    for (let k = 0; k < SEGMENTS; k++) {
      const seg = solveSegment(s, area / SEGMENTS, perm);
      Qp += seg.Qp;
      salt += seg.Qp * seg.Cp;
      boron += seg.Qp * seg.CpB;
      betaMax = Math.max(betaMax, seg.beta);
      ndpSum += seg.ndp;
      s = seg.out;
    }
    elements.push({
      index: e + 1,
      feedFlow: inlet.Qf,
      feedTds: inlet.C,
      feedPressure: inlet.P,
      concFlow: s.Qf,
      concTds: s.C,
      permFlow: Qp,
      permTds: Qp > 0 ? salt / Qp : 0,
      permBoron: Qp > 0 ? boron / Qp : 0,
      flux: Qp * 1000 / area,
      recovery: Qp / inlet.Qf,
      beta: betaMax,
      ndp: ndpSum / SEGMENTS,
      dp: inlet.P - s.P,
      osmoticIn: osmotic(inlet.C, perm.T),
    });
  }
  return { elements, out: s };
}

const calibrationCache = new Map();

// Back out A (water) and B (salt, boric acid) permeabilities at 25 °C so a
// single element reproduces the datasheet flow and rejection at test conditions.
export function calibrate(membrane) {
  if (calibrationCache.has(membrane.id)) return calibrationCache.get(membrane.id);
  const Qp = membrane.flow / 24;
  const Qf = Qp / TEST.recovery;
  const targetCp = TEST.tds * (1 - membrane.rejection / 100);
  const targetCpB = TEST.boron * (1 - membrane.boronRej / 100);
  let A = 1.2, B = 0.05, Bb = 1;
  for (let i = 0; i < 40; i++) {
    const perm = { A, B, Bb, T: TEST.temp, Pp: 0, dpFactor: 1 };
    const v = solveVessel({ Qf, C: TEST.tds, Cb: TEST.boron, P: TEST.pressure }, 1, membrane.area, perm);
    const el = v.elements[0];
    A *= Qp / el.permFlow;
    B *= targetCp / el.permTds;
    Bb *= targetCpB / el.permBoron;
  }
  const result = { A, B, Bb };
  calibrationCache.set(membrane.id, result);
  return result;
}

// Fill in derived quantities for a train and energy balance.
function summarise(inp, membrane, vessel, feedPerVessel) {
  const nv = inp.vessels;
  const els = vessel.elements;
  const qpVessel = els.reduce((s, e) => s + e.permFlow, 0);
  const salt = els.reduce((s, e) => s + e.permFlow * e.permTds, 0);
  const boron = els.reduce((s, e) => s + e.permFlow * e.permBoron, 0);
  const Qp = qpVessel * nv;          // m³/h
  const Qf = feedPerVessel * nv;
  const Qc = vessel.out.Qf * nv;
  const permTds = salt / qpVessel;
  const permBoron = boron / qpVessel;
  const Pf = inp._feedPressure;
  const Pc = vessel.out.P;
  const Plp = 2; // pretreatment / LP feed pump discharge, bar

  const etaHp = inp.pumpEff / 100;
  const etaB = 0.8;
  const etaErd = inp.erdEff / 100;
  let hpKw, boosterKw = 0, recoveredKw = 0;
  if (inp.erd === 'isobaric') {
    // PX-type exchanger: HP pump carries only the permeate-equivalent flow,
    // the ERD pressurises the rest, a booster tops it up.
    hpKw = Qp * (Pf - Plp) / 36 / etaHp;
    const pxOut = Plp + etaErd * (Pc - Plp);
    boosterKw = Qc * Math.max(Pf - pxOut, 0) / 36 / etaB;
    recoveredKw = Qc * (pxOut - Plp) / 36;
  } else if (inp.erd === 'turbine') {
    hpKw = Qf * (Pf - Plp) / 36 / etaHp;
    recoveredKw = Qc * Pc / 36 * etaErd;
    hpKw -= recoveredKw;
  } else {
    hpKw = Qf * (Pf - Plp) / 36 / etaHp;
  }
  const lpKw = Qf * Plp / 36 / 0.75;
  const totalKw = hpKw + boosterKw + lpKw;

  const totalArea = membrane.area * inp.elements * nv;
  const avgFlux = Qp * 1000 / totalArea;
  const warnings = [];
  const lead = els[0];
  const last = els[els.length - 1];
  if (Pf > membrane.maxP) warnings.push(`Feed pressure ${Pf.toFixed(1)} bar exceeds the ${membrane.maxP} bar element limit.`);
  if (avgFlux > inp.fluxLimit) warnings.push(`Average flux ${avgFlux.toFixed(1)} LMH is above the ${inp.fluxLimit} LMH guideline for this feed source — expect faster fouling.`);
  if (lead.flux > 35) warnings.push(`Lead element flux ${lead.flux.toFixed(1)} LMH is very high — lead elements will foul first.`);
  if (feedPerVessel > 16) warnings.push(`Feed flow ${feedPerVessel.toFixed(1)} m³/h per vessel is above ~16 m³/h (excessive pressure drop / telescoping risk).`);
  if (vessel.out.Qf < 3.4) warnings.push(`Concentrate flow ${vessel.out.Qf.toFixed(2)} m³/h per vessel is below ~3.4 m³/h — poor crossflow, high polarisation and scaling risk.`);
  const maxElRec = Math.max(...els.map((e) => e.recovery));
  if (maxElRec > 0.15) warnings.push(`An element is running at ${(maxElRec * 100).toFixed(1)} % recovery (guideline ≤ 15 %).`);
  const maxBeta = Math.max(...els.map((e) => e.beta));
  if (maxBeta > 1.2) warnings.push(`Concentration polarisation factor reaches ${maxBeta.toFixed(2)} (guideline ≤ 1.2).`);
  if (last.ndp < 3) warnings.push(`Net driving pressure at the tail element is only ${last.ndp.toFixed(1)} bar — the last elements barely produce water.`);
  if (vessel.out.C > 75000) warnings.push(`Concentrate TDS ${Math.round(vessel.out.C)} mg/L is very high — check CaCO₃/CaSO₄ scaling and antiscalant limits.`);

  return {
    feedPressure: Pf,
    concPressure: Pc,
    pressureDrop: Pf - Pc,
    feedFlow: Qf * 24,
    permFlow: Qp * 24,
    concFlow: Qc * 24,
    feedPerVessel,
    recovery: Qp / Qf,
    permTds,
    permCl: permTds * CL_FRACTION,
    permCond: permTds / TDS_PER_US,
    permBoron,
    rejection: 1 - permTds / inp.feedTds,
    boronRejection: 1 - permBoron / inp.feedBoron,
    concTds: vessel.out.C,
    concOsmotic: osmotic(vessel.out.C, inp.temp),
    feedOsmotic: osmotic(inp.feedTds, inp.temp),
    avgFlux,
    leadFlux: lead.flux,
    tailFlux: last.flux,
    maxBeta,
    borateFraction: borateFraction(inp.ph, inp.feedTds, inp.temp),
    hpKw, boosterKw, lpKw, recoveredKw, totalKw,
    sec: totalKw / Qp,
    elements: els,
    warnings,
    totalArea,
  };
}

function permeabilities(inp, membrane) {
  const cal = calibrate(membrane);
  const T = inp.temp;
  const fouling = 1 - inp.fouling / 100;
  const ageA = 0.93 ** inp.age;      // ~7 %/yr flux decline
  const ageB = 1.10 ** inp.age;      // ~10 %/yr salt passage increase
  const fb = borateFraction(inp.ph, inp.feedTds, T);
  // Borate ion is charged and rejected like salt; boric acid is small and neutral.
  const BbAcid = cal.Bb * tcfBoron(T) * ageB;
  const BbBorate = cal.B * 1.5 * tcfSalt(T) * ageB;
  return {
    A: cal.A * tcfWater(T) * fouling * ageA,
    B: cal.B * tcfSalt(T) * ageB,
    Bb: (1 - fb) * BbAcid + fb * BbBorate,
    T,
    Pp: inp.permPressure,
    dpFactor: 1 + inp.fouling / 50,
  };
}

function runAtPressure(inp, membrane, perm, P, feedPerVessel) {
  const v = solveVessel({ Qf: feedPerVessel, C: inp.feedTds, Cb: inp.feedBoron, P }, inp.elements, membrane.area, perm);
  const qp = v.elements.reduce((s, e) => s + e.permFlow, 0);
  return { v, qp };
}

// Main entry. mode 'pressure': feed pressure + feed flow are inputs.
// mode 'flow': permeate flow + recovery are inputs; feed pressure is solved.
export function simulate(input) {
  const inp = { ...input };
  const membrane = getMembrane(inp.membrane);
  const perm = permeabilities(inp, membrane);

  let feedPerVessel, P, run;
  if (inp.mode === 'flow') {
    const qpTarget = inp.permTarget / 24 / inp.vessels;
    feedPerVessel = qpTarget / (inp.recoveryTarget / 100);
    let lo = osmotic(inp.feedTds, inp.temp) + inp.permPressure;
    let hi = 150;
    run = runAtPressure(inp, membrane, perm, hi, feedPerVessel);
    if (run.qp < qpTarget) {
      P = hi;
    } else {
      for (let i = 0; i < 40; i++) {
        P = (lo + hi) / 2;
        run = runAtPressure(inp, membrane, perm, P, feedPerVessel);
        if (run.qp > qpTarget) hi = P; else lo = P;
        if (hi - lo < 0.005) break;
      }
      P = hi;
      run = runAtPressure(inp, membrane, perm, P, feedPerVessel);
    }
  } else {
    feedPerVessel = inp.feedFlow / 24 / inp.vessels;
    P = inp.feedPressure;
    run = runAtPressure(inp, membrane, perm, P, feedPerVessel);
  }
  inp._feedPressure = P;
  const out = summarise(inp, membrane, run.v, feedPerVessel);
  if (inp.mode === 'flow' && P >= 150) {
    out.warnings.unshift('Target cannot be reached even at 150 bar — reduce recovery or product flow, or add elements.');
  }
  out.membrane = membrane;
  return out;
}
