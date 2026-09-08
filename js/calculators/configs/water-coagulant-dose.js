export default {
  id: 'water-coagulant-dose',
  domain: 'water',
  title: 'Coagulant Dose Scale-Up',
  subtitle: 'Jar-test dose scaled to full plant flow (kg/day)',
  procedureRef: 'water-jar-test',
  inputs: [
    { id: 'dose', label: 'Dose', unit: 'mg/L' },
    { id: 'flow', label: 'Plant Flow', unit: 'm³/day' },
  ],
  compute({ dose, flow }) {
    // 1 mg/L = 1 g/m³, so dose × flow gives g/day directly
    const kgPerDay = (dose * flow) / 1000;
    return { 'Chemical Feed Rate': { value: kgPerDay, unit: 'kg/day' } };
  },
};
