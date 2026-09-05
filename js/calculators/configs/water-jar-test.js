export default {
  id: 'water-jar-test',
  domain: 'water',
  title: 'Jar Test Comparison',
  subtitle: 'Enter each jar’s dose and resulting turbidity to find the optimum dose',
  procedureRef: 'water-jar-test',
  inputs: [
    {
      id: 'rows',
      type: 'rows',
      label: 'Jar Test Results',
      minRows: 4,
      columns: [
        { id: 'jar', label: 'Jar #' },
        { id: 'dose', label: 'Dose (mg/L)' },
        { id: 'turbidity', label: 'Final Turbidity (NTU)' },
      ],
    },
  ],
  compute({ rows }) {
    const valid = (rows || []).filter((r) => Number.isFinite(r.dose) && Number.isFinite(r.turbidity));
    if (!valid.length) throw new Error('Enter dose and turbidity for at least one jar');
    const best = valid.reduce((a, b) => (b.turbidity < a.turbidity ? b : a));
    return {
      'Recommended Dose': { value: best.dose, unit: 'mg/L' },
      'Resulting Turbidity': { value: best.turbidity, unit: 'NTU' },
    };
  },
};
