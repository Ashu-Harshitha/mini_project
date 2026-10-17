/**
 * AgriAdvisor AI Units Helper
 * Toggle between Imperial (lb/ac, gal/ac, acres, °F, in) and Metric (kg/ha, L/ha, ha, °C, mm).
 */

export type UnitSystem = 'imperial' | 'metric';

export const units = {
  // Fertilizer conversion (lb/ac <-> kg/ha)
  convertFertilizer(amountInLbPerAc: number, system: UnitSystem): { value: number; unit: string; label: string } {
    if (system === 'metric') {
      const kgHa = Math.round(amountInLbPerAc * 1.12085);
      return { value: kgHa, unit: 'kg/ha', label: `${kgHa} kg/ha` };
    }
    return { value: amountInLbPerAc, unit: 'lb/ac', label: `${amountInLbPerAc} lb/ac` };
  },

  // Liquid fertilizer / chemical spray (gal/ac <-> L/ha)
  convertLiquid(amountInGalPerAc: number, system: UnitSystem): { value: number; unit: string; label: string } {
    if (system === 'metric') {
      const lHa = Math.round(amountInGalPerAc * 9.35396);
      return { value: lHa, unit: 'L/ha', label: `${lHa} L/ha` };
    }
    return { value: amountInGalPerAc, unit: 'gal/ac', label: `${amountInGalPerAc} gal/ac` };
  },

  // Land Area (acres <-> hectares)
  convertArea(acres: number, system: UnitSystem): { value: number; unit: string; label: string } {
    if (system === 'metric') {
      const ha = Math.round(acres * 0.404686);
      return { value: ha, unit: 'ha', label: `${ha} ha` };
    }
    return { value: acres, unit: 'acres', label: `${acres} acres` };
  },

  // Temperature (input in Celsius)
  convertTemp(celsius: number, system: UnitSystem): { value: number; unit: string; label: string } {
    if (system === 'imperial') {
      const f = Math.round((celsius * 9) / 5 + 32);
      return { value: f, unit: '°F', label: `${f}°F` };
    }
    return { value: celsius, unit: '°C', label: `${celsius}°C` };
  },

  // Rainfall (input in mm)
  convertRainfall(mm: number, system: UnitSystem): { value: number; unit: string; label: string } {
    if (system === 'imperial') {
      const inches = (mm / 25.4).toFixed(1);
      return { value: parseFloat(inches), unit: 'in', label: `${inches} in` };
    }
    return { value: mm, unit: 'mm', label: `${mm}mm` };
  },

  // Wind speed (input in km/h)
  convertWind(kmh: number, system: UnitSystem): { value: number; unit: string; label: string } {
    if (system === 'imperial') {
      const mph = Math.round(kmh * 0.621371);
      return { value: mph, unit: 'mph', label: `${mph} mph` };
    }
    return { value: kmh, unit: 'km/h', label: `${kmh} km/h` };
  },
};
