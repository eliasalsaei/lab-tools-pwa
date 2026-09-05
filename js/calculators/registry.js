import water_alkalinity from './configs/water-alkalinity.js';
import water_hardness from './configs/water-hardness.js';
import water_chlorine_residual from './configs/water-chlorine-residual.js';
import water_tds_conductivity from './configs/water-tds-conductivity.js';
import water_coagulant_dose from './configs/water-coagulant-dose.js';
import water_feed_pump_rate from './configs/water-feed-pump-rate.js';
import water_jar_test from './configs/water-jar-test.js';

import boiler_coc from './configs/boiler-coc.js';
import boiler_blowdown_rate from './configs/boiler-blowdown-rate.js';
import boiler_percent_blowdown from './configs/boiler-percent-blowdown.js';
import boiler_silica_carryover from './configs/boiler-silica-carryover.js';
import boiler_phosphate_dose from './configs/boiler-phosphate-dose.js';
import boiler_sulfite_dose from './configs/boiler-sulfite-dose.js';
import boiler_condensate_return from './configs/boiler-condensate-return.js';
import boiler_tds_conductivity from './configs/boiler-tds-conductivity.js';

import wastewater_bod5 from './configs/wastewater-bod5.js';
import wastewater_cod from './configs/wastewater-cod.js';
import wastewater_mlss from './configs/wastewater-mlss.js';
import wastewater_svi from './configs/wastewater-svi.js';
import wastewater_srt from './configs/wastewater-srt.js';
import wastewater_fm_ratio from './configs/wastewater-fm-ratio.js';
import wastewater_do_saturation from './configs/wastewater-do-saturation.js';

export const DOMAINS = [
  { id: 'water', label: 'Water Treatment', icon: '\u{1F4A7}' },
  { id: 'boiler', label: 'Boiler / Power Plant', icon: '\u{1F525}' },
  { id: 'wastewater', label: 'Wastewater', icon: '♻️' },
];

export const CALCULATORS = [
  water_alkalinity,
  water_hardness,
  water_chlorine_residual,
  water_tds_conductivity,
  water_coagulant_dose,
  water_feed_pump_rate,
  water_jar_test,

  boiler_coc,
  boiler_blowdown_rate,
  boiler_percent_blowdown,
  boiler_silica_carryover,
  boiler_phosphate_dose,
  boiler_sulfite_dose,
  boiler_condensate_return,
  boiler_tds_conductivity,

  wastewater_bod5,
  wastewater_cod,
  wastewater_mlss,
  wastewater_svi,
  wastewater_srt,
  wastewater_fm_ratio,
  wastewater_do_saturation,
];

export function getCalculator(id) {
  return CALCULATORS.find((c) => c.id === id);
}

export function calculatorsByDomain(domainId) {
  return CALCULATORS.filter((c) => c.domain === domainId);
}
