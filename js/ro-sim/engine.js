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
const PLP = 2;                // pretreatment / LP feed pump discharge, bar

// TDS (mg/L) per µS/cm rises from ~0.5 for dilute NaCl permeate to ~0.70 for
// seawater and ~0.75 for brine. Smooth fit so both directions round-trip.
export function tdsFactor(tds) {
  return Math.min(0.5 + 0.2 * Math.sqrt(Math.max(tds, 0) / 35000), 0.75);
}

export function tdsToEc(tds) {
  return tds / tdsFactor(tds);
}

export function ecToTds(ec) {
  let lo = 0, hi = ec;  // factor ≤ 1, so TDS ≤ EC
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (tdsToEc(mid) < ec) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

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
    // Split-permeate vessels: elements before the plug drain to the front
    // permeate port, the rest to the rear port, each with its own back-pressure.
    const front = e < perm.split;
    const permE = front ? { ...perm, Pp: perm.PpFront } : perm;
    let Qp = 0, salt = 0, boron = 0, betaMax = 0, ndpSum = 0;
    for (let k = 0; k < SEGMENTS; k++) {
      const seg = solveSegment(s, area / SEGMENTS, permE);
      Qp += seg.Qp;
      salt += seg.Qp * seg.Cp;
      boron += seg.Qp * seg.CpB;
      betaMax = Math.max(betaMax, seg.beta);
      ndpSum += seg.ndp;
      s = seg.out;
    }
    const permTds = Qp > 0 ? salt / Qp : 0;
    elements.push({
      index: e + 1,
      port: front ? 'front' : 'rear',
      permEc: tdsToEc(permTds),
      feedEc: tdsToEc(inlet.C),
      feedFlow: inlet.Qf,
      feedTds: inlet.C,
      feedPressure: inlet.P,
      concFlow: s.Qf,
      concTds: s.C,
      permFlow: Qp,
      permTds,
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
    const perm = { A, B, Bb, T: TEST.temp, Pp: 0, PpFront: 0, split: 0, dpFactor: 1 };
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

// Blend a list of elements into one permeate stream (per vessel, m³/h).
function blend(els) {
  const q = els.reduce((s, e) => s + e.permFlow, 0);
  if (q <= 0) return { flow: 0, tds: 0, boron: 0, ec: 0 };
  const tds = els.reduce((s, e) => s + e.permFlow * e.permTds, 0) / q;
  const boron = els.reduce((s, e) => s + e.permFlow * e.permBoron, 0) / q;
  return { flow: q, tds, boron, ec: tdsToEc(tds) };
}

// Energy balance of the high-pressure loop. Flows m³/h, pressures bar.
function energy(inp, Qf, Qp, Qc, Pf, Pc) {
  const etaHp = inp.pumpEff / 100;
  const etaB = 0.8;
  const etaErd = inp.erdEff / 100;
  const e = { hpFlow: Qf, hpDp: Pf - PLP, boosterFlow: 0, boosterDp: 0, erdFlow: 0, erdOut: 0, leakFlow: 0, boosterKw: 0, recoveredKw: 0 };
  if (inp.erd === 'isobaric') {
    // Pressure exchanger: brine pressurises an equal volume of seawater, a
    // booster tops it up to feed pressure. Lubrication flow leaks from the
    // HP side, so the HP pump makes up permeate + leakage.
    const L = Qc * inp.erdLeak / 100;
    e.leakFlow = L;
    e.erdFlow = Qc - L;
    e.erdOut = PLP + etaErd * (Pc - PLP);
    e.hpFlow = Qp + L;
    e.boosterFlow = Qc - L;
    e.boosterDp = Math.max(Pf - e.erdOut, 0);
    e.boosterKw = e.boosterFlow * e.boosterDp / 36 / etaB;
    e.recoveredKw = e.erdFlow * (e.erdOut - PLP) / 36;
  } else if (inp.erd === 'turbine') {
    e.erdFlow = Qc;
    e.recoveredKw = Qc * Pc / 36 * etaErd;
  }
  e.hpKw = e.hpFlow * e.hpDp / 36 / etaHp - (inp.erd === 'turbine' ? e.recoveredKw : 0);
  e.lpKw = Qf * PLP / 36 / 0.75;
  e.totalKw = e.hpKw + e.boosterKw + e.lpKw;
  // Same plant with the brine simply throttled, for comparison.
  e.noErdKw = Qf * (Pf - PLP) / 36 / etaHp + e.lpKw;
  return e;
}

function summarise(inp, membrane, vessel, feedPerVessel, membraneFeed) {
  const nv = inp.vessels;
  const els = vessel.elements;
  const all = blend(els);
  const front = blend(els.filter((e) => e.port === 'front'));
  const rear = blend(els.filter((e) => e.port === 'rear'));
  const Qp = all.flow * nv;          // m³/h
  const Qf = feedPerVessel * nv;
  const Qc = vessel.out.Qf * nv;
  const Pf = inp._feedPressure;
  const Pc = vessel.out.P;
  const en = energy(inp, Qf, Qp, Qc, Pf, Pc);

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
  if (inp.split > 0 && front.flow <= 0) warnings.push('Front permeate back-pressure is so high that the front elements make no water.');
  const permBackMax = inp.split > 0 ? Math.max(inp._rearBack, inp._frontBack) : inp._rearBack;
  if (permBackMax > 4.5) warnings.push(`Permeate back-pressure ${permBackMax.toFixed(1)} bar is close to the ~5 bar limit at which elements can be damaged on shutdown.`);

  return {
    feedPressure: Pf,
    concPressure: Pc,
    pressureDrop: Pf - Pc,
    feedFlow: Qf * 24,
    permFlow: Qp * 24,
    concFlow: Qc * 24,
    feedPerVessel,
    recovery: Qp / Qf,
    permTds: all.tds,
    permCl: all.tds * CL_FRACTION,
    permCond: all.ec,
    permBoron: all.boron,
    split: inp.split > 0,
    frontBackPressure: inp._frontBack,
    rearBackPressure: inp._rearBack,
    frontFlow: front.flow * nv * 24,
    frontShare: front.flow / all.flow,
    frontTds: front.tds,
    frontCond: front.ec,
    frontBoron: front.boron,
    rearFlow: rear.flow * nv * 24,
    rearShare: rear.flow / all.flow,
    rearTds: rear.tds,
    rearCond: rear.ec,
    rearBoron: rear.boron,
    rejection: 1 - all.tds / inp.feedTds,
    boronRejection: 1 - all.boron / inp.feedBoron,
    feedTds: inp.feedTds,
    feedCond: tdsToEc(inp.feedTds),
    membraneFeedTds: membraneFeed.C,
    membraneFeedCond: tdsToEc(membraneFeed.C),
    membraneFeedBoron: membraneFeed.Cb,
    salinityIncrease: membraneFeed.C / inp.feedTds - 1,
    concTds: vessel.out.C,
    concCond: tdsToEc(vessel.out.C),
    concOsmotic: osmotic(vessel.out.C, inp.temp),
    feedOsmotic: osmotic(membraneFeed.C, inp.temp),
    avgFlux,
    leadFlux: lead.flux,
    tailFlux: last.flux,
    maxBeta,
    borateFraction: borateFraction(inp.ph, inp.feedTds, inp.temp),
    ...en,
    sec: en.totalKw / Qp,
    secNoErd: en.noErdKw / Qp,
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
    PpFront: inp.frontPermPressure,
    split: Math.min(inp.split || 0, inp.elements - 1),
    dpFactor: 1 + inp.fouling / 50,
  };
}

function runAtPressure(inp, membrane, perm, P, feedPerVessel, feed) {
  const v = solveVessel({ Qf: feedPerVessel, C: feed.C, Cb: feed.Cb, P }, inp.elements, membrane.area, perm);
  const qp = v.elements.reduce((s, e) => s + e.permFlow, 0);
  return { v, qp };
}

// Feed pressure that delivers qpTarget (per vessel), by bisection.
function solvePressure(inp, membrane, perm, feedPerVessel, feed, qpTarget, lo, hi) {
  let run = runAtPressure(inp, membrane, perm, hi, feedPerVessel, feed);
  if (run.qp < qpTarget) return { P: hi, run, capped: true };
  for (let i = 0; i < 40 && hi - lo > 0.005; i++) {
    const P = (lo + hi) / 2;
    const r = runAtPressure(inp, membrane, perm, P, feedPerVessel, feed);
    if (r.qp > qpTarget) hi = P; else lo = P;
  }
  run = runAtPressure(inp, membrane, perm, hi, feedPerVessel, feed);
  return { P: hi, run, capped: false };
}

const THROTTLE_MAX = 20;  // bar a split-control valve may add on either port

// Front share of the permeate in one vessel run.
function frontShare(run) {
  const front = run.v.elements.filter((e) => e.port === 'front').reduce((s, e) => s + e.permFlow, 0);
  return run.qp > 0 ? front / run.qp : 0;
}

// Back-pressures with throttle t: t > 0 throttles the front port, t < 0 the rear.
function withThrottle(perm, inp, t) {
  return { ...perm, PpFront: inp.frontPermPressure + Math.max(t, 0), Pp: inp.permPressure + Math.max(-t, 0) };
}

// Find the throttle that gives the target front share at feed pressure P.
// Front share falls monotonically as t rises.
function solveThrottle(inp, membrane, perm, P, feedPerVessel, feed, target, t0) {
  const share = (t) => frontShare(runAtPressure(inp, membrane, withThrottle(perm, inp, t), P, feedPerVessel, feed));
  let lo = -THROTTLE_MAX, hi = THROTTLE_MAX;
  if (t0 !== null) {
    // Warm start: a narrow bracket around the last answer, if it still brackets.
    const a = Math.max(t0 - 1, lo), b = Math.min(t0 + 1, hi);
    if (share(a) >= target && share(b) <= target) { lo = a; hi = b; }
  }
  if (share(lo) < target) return { t: lo, reached: false };
  if (share(hi) > target) return { t: hi, reached: false };
  while (hi - lo > 0.005) {
    const mid = (lo + hi) / 2;
    if (share(mid) > target) lo = mid; else hi = mid;
  }
  return { t: (lo + hi) / 2, reached: true };
}

// Main entry. mode 'pressure': feed pressure + feed flow are inputs.
// mode 'flow': permeate flow + recovery are inputs; feed pressure is solved.
export function simulate(input) {
  const inp = { split: 0, frontPermPressure: 0, erdLeak: 0, erdMixing: 0, splitControl: 'pressure', splitTarget: 60, ...input };
  const membrane = getMembrane(inp.membrane);
  const basePerm = permeabilities(inp, membrane);
  const P_MAX = 150;

  // An isobaric ERD mixes some brine into the seawater it pressurises, so the
  // membranes see a saltier feed than the intake. That depends on the brine,
  // which depends on the feed. A split-ratio controller adds a valve setting
  // that depends on the feed pressure, and vice versa. Iterate to a fixed point.
  const raw = { C: inp.feedTds, Cb: inp.feedBoron };
  let feed = { ...raw };
  const mixing = inp.erd === 'isobaric' ? inp.erdMixing / 100 : 0;
  const leak = inp.erd === 'isobaric' ? inp.erdLeak / 100 : 0;
  const flowMode = inp.mode === 'flow';
  const ratioControl = inp.splitControl === 'ratio' && basePerm.split > 0;
  const target = inp.splitTarget / 100;
  const qpTarget = flowMode ? inp.permTarget / 24 / inp.vessels : 0;
  const feedPerVessel = flowMode ? qpTarget / (inp.recoveryTarget / 100) : inp.feedFlow / 24 / inp.vessels;

  let P = inp.feedPressure, run, capped = false;
  let t = 0, reached = true, tPrev = null;
  let perm = basePerm;
  const passes = mixing > 0 || ratioControl ? 12 : 1;
  for (let it = 0; it < passes; it++) {
    const Pprev = P;
    if (flowMode) {
      // Warm-start the bracket from the previous pass.
      const lo = it ? P - 5 : osmotic(feed.C, inp.temp) + Math.min(perm.Pp, perm.PpFront);
      const hi = it ? Math.min(P + 5, P_MAX) : P_MAX;
      ({ P, run, capped } = solvePressure(inp, membrane, perm, feedPerVessel, feed, qpTarget, lo, hi));
    } else {
      run = runAtPressure(inp, membrane, perm, P, feedPerVessel, feed);
    }
    let settled = true;
    if (ratioControl) {
      ({ t, reached } = solveThrottle(inp, membrane, basePerm, P, feedPerVessel, feed, target, tPrev));
      settled = tPrev !== null && Math.abs(t - tPrev) < 0.01;
      tPrev = t;
      perm = withThrottle(basePerm, inp, t);
      run = runAtPressure(inp, membrane, perm, P, feedPerVessel, feed);
    }
    if (mixing > 0) {
      const Qp = run.qp, Qc = run.v.out.Qf, L = leak * Qc;
      const erdStream = Qc - L;
      const mixC = raw.C + mixing * (run.v.out.C - raw.C);
      const mixB = raw.Cb + mixing * (run.v.out.Cb - raw.Cb);
      const next = {
        C: ((Qp + L) * raw.C + erdStream * mixC) / feedPerVessel,
        Cb: ((Qp + L) * raw.Cb + erdStream * mixB) / feedPerVessel,
      };
      if (Math.abs(next.C - feed.C) >= 0.5) settled = false;
      feed = next;
    }
    if (it > 0 && Math.abs(P - Pprev) > 0.01) settled = false;
    if (settled && (it > 0 || passes === 1)) break;
  }
  inp._feedPressure = P;
  inp._frontBack = perm.PpFront;
  inp._rearBack = perm.Pp;
  const out = summarise(inp, membrane, run.v, feedPerVessel, feed);
  if (flowMode && capped) {
    out.warnings.unshift('Target cannot be reached even at 150 bar — reduce recovery or product flow, or add elements.');
  }
  if (ratioControl && !reached) {
    out.warnings.unshift(`A ${inp.splitTarget} % front split cannot be reached by throttling either port (limit +${THROTTLE_MAX} bar). Move the split point instead.`);
  }
  out.splitControl = ratioControl ? 'ratio' : 'pressure';
  out.throttlePort = !ratioControl || Math.abs(t) < 0.005 ? null : t > 0 ? 'front' : 'rear';
  out.throttle = Math.abs(t);
  out.membrane = membrane;
  return out;
}
