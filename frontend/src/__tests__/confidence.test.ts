import { describe, it, expect } from 'vitest';
import { clampConfidence, getUncertaintyBand, getConfidenceDetails } from '@/lib/confidence';

describe('Confidence & Uncertainty Bands', () => {
  it('clamps confidence between 0 and 100', () => {
    expect(clampConfidence(85)).toBe(85);
    expect(clampConfidence(110)).toBe(100);
    expect(clampConfidence(-15)).toBe(0);
    expect(clampConfidence(NaN)).toBe(0);
  });

  it('maps scores to correct uncertainty bands', () => {
    // Low uncertainty (>= 80%)
    expect(getUncertaintyBand(80)).toBe('Low');
    expect(getUncertaintyBand(95)).toBe('Low');
    expect(getUncertaintyBand(100)).toBe('Low');

    // Medium uncertainty (60% to 79%)
    expect(getUncertaintyBand(60)).toBe('Medium');
    expect(getUncertaintyBand(75)).toBe('Medium');
    expect(getUncertaintyBand(79)).toBe('Medium');

    // High uncertainty (< 60%)
    expect(getUncertaintyBand(59)).toBe('High');
    expect(getUncertaintyBand(40)).toBe('High');
    expect(getUncertaintyBand(0)).toBe('High');
  });

  it('provides complete confidence details and badge styling', () => {
    const low = getConfidenceDetails(88);
    expect(low.uncertaintyBand).toBe('Low');
    expect(low.badgeLabel).toBe('Low Uncertainty');
    expect(low.badgeColorClass).toContain('emerald');

    const med = getConfidenceDetails(68);
    expect(med.uncertaintyBand).toBe('Medium');
    expect(med.badgeLabel).toBe('Medium Uncertainty');
    expect(med.badgeColorClass).toContain('amber');

    const high = getConfidenceDetails(45);
    expect(high.uncertaintyBand).toBe('High');
    expect(high.badgeLabel).toBe('High Uncertainty');
    expect(high.badgeColorClass).toContain('rose');
  });
});
