export default {
  id: 'boiler-condensate-return',
  domain: 'boiler',
  title: 'Condensate Return %',
  subtitle: 'Condensate flow as a percentage of feedwater flow',
  procedureRef: 'boiler-feedwater-condensate-sampling',
  inputs: [
    { id: 'condensateFlow', label: 'Condensate Flow', unit: 'm³/h' },
    { id: 'feedwaterFlow', label: 'Feedwater Flow', unit: 'm³/h' },
  ],
  compute({ condensateFlow, feedwaterFlow }) {
    if (!(feedwaterFlow > 0)) throw new Error('Feedwater flow must be greater than 0');
    const pct = (condensateFlow / feedwaterFlow) * 100;
    const makeup = feedwaterFlow - condensateFlow;
    return {
      '% Condensate Return': { value: pct, unit: '%' },
      'Makeup Water Required': { value: makeup, unit: 'm³/h' },
    };
  },
};
