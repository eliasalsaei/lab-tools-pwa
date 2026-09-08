export default {
  id: 'wastewater-srt',
  domain: 'wastewater',
  title: 'Sludge Age (SRT)',
  subtitle: 'Solids retention time from MLSS mass and daily solids removal',
  procedureRef: 'wastewater-mlss-mlvss-sm2540',
  inputs: [
    { id: 'mlss', label: 'MLSS', unit: 'mg/L' },
    { id: 'aerationVolume', label: 'Aeration Basin Volume', unit: 'm³' },
    { id: 'tssWastedPerDay', label: 'TSS Wasted per Day (WAS)', unit: 'kg/day' },
    { id: 'tssEffluentPerDay', label: 'TSS Lost in Effluent per Day', unit: 'kg/day', default: 0 },
  ],
  compute({ mlss, aerationVolume, tssWastedPerDay, tssEffluentPerDay }) {
    const totalRemoved = tssWastedPerDay + tssEffluentPerDay;
    if (!(totalRemoved > 0)) throw new Error('Total solids removed per day must be greater than 0');
    // 1 mg/L = 1 g/m³, so mlss × volume gives grams; /1000 for kg
    const mlssKg = (mlss * aerationVolume) / 1000;
    const srt = mlssKg / totalRemoved;
    return {
      'SRT (Sludge Age)': { value: srt, unit: 'days' },
      'Solids in System': { value: mlssKg, unit: 'kg' },
    };
  },
};
