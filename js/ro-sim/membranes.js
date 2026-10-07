// Approximate nominal specs for Toray TM800-series 8-inch SWRO elements.
// Standard test conditions (Toray): 32,000 mg/L NaCl, 5.52 MPa (55.2 bar),
// 25 °C, pH 7, 8 % recovery, 5 mg/L boron (where boron is quoted).
// Values are taken from public product summaries and rounded; check the current
// Toray datasheet before using them for real design work.
export const TEST = {
  tds: 32000,       // mg/L NaCl
  pressure: 55.2,   // bar
  temp: 25,         // °C
  recovery: 0.08,
  boron: 5,         // mg/L
};

export const MEMBRANES = [
  {
    id: 'TM820V-440', label: 'TM820V-440 — standard, high rejection',
    area: 41, flow: 24.6, rejection: 99.80, boronRej: 93, maxP: 83,
  },
  {
    id: 'TM820K-440', label: 'TM820K-440 — high boron rejection',
    area: 41, flow: 22.7, rejection: 99.86, boronRej: 95, maxP: 83,
  },
  {
    id: 'TM820R-440', label: 'TM820R-440 — high rejection / boron',
    area: 41, flow: 23.0, rejection: 99.86, boronRej: 95, maxP: 83,
  },
  {
    id: 'TM820M-440', label: 'TM820M-440 — balanced flow',
    area: 41, flow: 32.0, rejection: 99.80, boronRej: 91, maxP: 83,
  },
  {
    id: 'TM820E-440', label: 'TM820E-440 — energy saving',
    area: 41, flow: 34.1, rejection: 99.75, boronRej: 89, maxP: 83,
  },
  {
    id: 'TM820L-440', label: 'TM820L-440 — low energy, high flow',
    area: 41, flow: 37.9, rejection: 99.75, boronRej: 89, maxP: 83,
  },
  {
    id: 'TM820C-400', label: 'TM820C-400 — 400 ft² standard',
    area: 37, flow: 24.6, rejection: 99.75, boronRej: 91, maxP: 83,
  },
];

export function getMembrane(id) {
  return MEMBRANES.find((m) => m.id === id) || MEMBRANES[0];
}
