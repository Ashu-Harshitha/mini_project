import { describe, it, expect } from 'vitest';
import { units } from '@/lib/units';

describe('Units Toggle & Conversions', () => {
  it('converts fertilizer amounts correctly between imperial and metric', () => {
    // Imperial default
    const imp = units.convertFertilizer(100, 'imperial');
    expect(imp.value).toBe(100);
    expect(imp.unit).toBe('lb/ac');
    expect(imp.label).toBe('100 lb/ac');

    // Metric conversion (1 lb/ac * 1.12085)
    const met = units.convertFertilizer(100, 'metric');
    expect(met.value).toBe(112);
    expect(met.unit).toBe('kg/ha');
    expect(met.label).toBe('112 kg/ha');
  });

  it('converts liquid application rates correctly', () => {
    const imp = units.convertLiquid(5, 'imperial');
    expect(imp.value).toBe(5);
    expect(imp.unit).toBe('gal/ac');

    // 5 gal/ac * 9.35396 ≈ 47 L/ha
    const met = units.convertLiquid(5, 'metric');
    expect(met.value).toBe(47);
    expect(met.unit).toBe('L/ha');
  });

  it('converts acreage to hectares', () => {
    const imp = units.convertArea(250, 'imperial');
    expect(imp.value).toBe(250);
    expect(imp.unit).toBe('acres');

    // 250 acres * 0.404686 ≈ 101 ha
    const met = units.convertArea(250, 'metric');
    expect(met.value).toBe(101);
    expect(met.unit).toBe('ha');
  });

  it('converts temperature from Celsius to Fahrenheit for imperial toggle', () => {
    // 25°C to °F = (25 * 9)/5 + 32 = 77°F
    const imp = units.convertTemp(25, 'imperial');
    expect(imp.value).toBe(77);
    expect(imp.unit).toBe('°F');

    const met = units.convertTemp(25, 'metric');
    expect(met.value).toBe(25);
    expect(met.unit).toBe('°C');
  });

  it('converts rainfall from mm to inches for imperial toggle', () => {
    // 25.4 mm = 1.0 in
    const imp = units.convertRainfall(25.4, 'imperial');
    expect(imp.value).toBe(1.0);
    expect(imp.unit).toBe('in');

    const met = units.convertRainfall(25.4, 'metric');
    expect(met.value).toBe(25.4);
    expect(met.unit).toBe('mm');
  });
});
