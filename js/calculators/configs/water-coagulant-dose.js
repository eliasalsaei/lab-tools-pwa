export default {
  id: 'water-coagulant-dose',
  domain: 'water',
  title: 'Coagulant Dose Scale-Up',
  subtitle: 'Jar-test dose scaled to full plant flow (lbs/day)',
  procedureRef: 'water-jar-test',
  inputs: [
    { id: 'dose', label: 'Dose', unit: 'mg/L' },
    { id: 'flow', label: 'Plant Flow', unit: 'MGD' },
  ],
  compute({ dose, flow }) {
    const lbsPerDay = dose * flow * 8.34;
    return { 'Chemical Feed Rate': { value: lbsPerDay, unit: 'lbs/day' } };
  },
};
