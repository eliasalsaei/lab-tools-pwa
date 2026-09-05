// DO saturation (mg/L) at 1 atm, freshwater, per Standard Methods table (approx., every 5°C)
const DO_SAT_TABLE = [
  [0, 14.62], [5, 12.77], [10, 11.29], [15, 10.08],
  [20, 9.09], [25, 8.26], [30, 7.56], [35, 6.95], [40, 6.41],
];

function interpolateDoSat(tempC) {
  const t = Math.min(Math.max(tempC, DO_SAT_TABLE[0][0]), DO_SAT_TABLE[DO_SAT_TABLE.length - 1][0]);
  for (let i = 0; i < DO_SAT_TABLE.length - 1; i++) {
    const [t0, v0] = DO_SAT_TABLE[i];
    const [t1, v1] = DO_SAT_TABLE[i + 1];
    if (t >= t0 && t <= t1) {
      const frac = (t - t0) / (t1 - t0);
      return v0 + frac * (v1 - v0);
    }
  }
  return DO_SAT_TABLE[DO_SAT_TABLE.length - 1][1];
}

export default {
  id: 'wastewater-do-saturation',
  domain: 'wastewater',
  title: 'DO % Saturation',
  subtitle: 'Measured dissolved oxygen vs. theoretical saturation at temperature',
  procedureRef: 'wastewater-do-sm4500og',
  inputs: [
    { id: 'waterTemp', label: 'Water Temperature', unit: '°C' },
    { id: 'measuredDO', label: 'Measured DO', unit: 'mg/L' },
    { id: 'pressureCorrection', label: 'Barometric Pressure Correction (1.0 = sea level)', default: 1.0 },
  ],
  compute({ waterTemp, measuredDO, pressureCorrection }) {
    const satBase = interpolateDoSat(waterTemp) * pressureCorrection;
    const pctSat = (measuredDO / satBase) * 100;
    return {
      'DO Saturation Value': { value: satBase, unit: 'mg/L' },
      'Percent Saturation': { value: pctSat, unit: '%' },
    };
  },
};
