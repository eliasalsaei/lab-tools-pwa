export default {
  id: 'wastewater-srt',
  domain: 'wastewater',
  title: 'Sludge Age (SRT)',
  subtitle: 'Solids retention time from MLSS mass and daily solids removal',
  procedureRef: 'wastewater-mlss-mlvss-sm2540',
  inputs: [
    { id: 'mlss', label: 'MLSS', unit: 'mg/L' },
    { id: 'aerationVolume', label: 'Aeration Basin Volume', unit: 'MG' },
    { id: 'tssWastedPerDay', label: 'TSS Wasted per Day (WAS)', unit: 'lbs/day' },
    { id: 'tssEffluentPerDay', label: 'TSS Lost in Effluent per Day', unit: 'lbs/day', default: 0 },
  ],
  compute({ mlss, aerationVolume, tssWastedPerDay, tssEffluentPerDay }) {
    const totalRemoved = tssWastedPerDay + tssEffluentPerDay;
    if (!(totalRemoved > 0)) throw new Error('Total solids removed per day must be greater than 0');
    const mlssLbs = mlss * aerationVolume * 8.34;
    const srt = mlssLbs / totalRemoved;
    return { 'SRT (Sludge Age)': { value: srt, unit: 'days' } };
  },
};
