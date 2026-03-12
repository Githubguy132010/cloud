import { describe, it, expect } from 'vitest';
import {
  isCalverAtLeast,
  getProactiveRefreshThresholdMs,
  PROACTIVE_REFRESH_THRESHOLD_MS,
} from './config';

describe('isCalverAtLeast', () => {
  it('returns true when equal', () => {
    expect(isCalverAtLeast('2026.3.12', [2026, 3, 12])).toBe(true);
  });

  it('returns true when version is greater (patch)', () => {
    expect(isCalverAtLeast('2026.3.13', [2026, 3, 12])).toBe(true);
  });

  it('returns true when version is greater (minor)', () => {
    expect(isCalverAtLeast('2026.4.1', [2026, 3, 12])).toBe(true);
  });

  it('returns true when version is greater (major)', () => {
    expect(isCalverAtLeast('2027.1.1', [2026, 3, 12])).toBe(true);
  });

  it('returns false when version is less (patch)', () => {
    expect(isCalverAtLeast('2026.3.11', [2026, 3, 12])).toBe(false);
  });

  it('returns false when version is less (minor)', () => {
    expect(isCalverAtLeast('2026.2.20', [2026, 3, 12])).toBe(false);
  });

  it('returns false when version is less (major)', () => {
    expect(isCalverAtLeast('2025.12.31', [2026, 3, 12])).toBe(false);
  });

  it('handles multi-digit segments correctly (10 > 4)', () => {
    expect(isCalverAtLeast('2026.10.1', [2026, 4, 1])).toBe(true);
  });

  it('handles multi-digit segments correctly (4 < 10)', () => {
    expect(isCalverAtLeast('2026.4.1', [2026, 10, 1])).toBe(false);
  });

  it('returns false for malformed input (too few segments)', () => {
    expect(isCalverAtLeast('2026.3', [2026, 3, 12])).toBe(false);
  });

  it('returns false for malformed input (non-numeric)', () => {
    expect(isCalverAtLeast('2026.3.abc', [2026, 3, 12])).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isCalverAtLeast('', [2026, 3, 12])).toBe(false);
  });

  it('returns true with extra segments (ignores beyond third)', () => {
    expect(isCalverAtLeast('2026.3.12.1', [2026, 3, 12])).toBe(true);
  });

  it('handles "dev" version string', () => {
    expect(isCalverAtLeast('dev', [2026, 3, 12])).toBe(false);
  });
});

describe('getProactiveRefreshThresholdMs', () => {
  it('returns default when no override', () => {
    expect(getProactiveRefreshThresholdMs(undefined)).toBe(PROACTIVE_REFRESH_THRESHOLD_MS);
  });

  it('returns default for empty string', () => {
    expect(getProactiveRefreshThresholdMs('')).toBe(PROACTIVE_REFRESH_THRESHOLD_MS);
  });

  it('converts hours to milliseconds', () => {
    expect(getProactiveRefreshThresholdMs('24')).toBe(24 * 60 * 60 * 1000);
  });

  it('handles fractional hours', () => {
    expect(getProactiveRefreshThresholdMs('0.5')).toBe(30 * 60 * 1000);
  });

  it('returns default for non-numeric string', () => {
    expect(getProactiveRefreshThresholdMs('abc')).toBe(PROACTIVE_REFRESH_THRESHOLD_MS);
  });

  it('returns default for zero', () => {
    expect(getProactiveRefreshThresholdMs('0')).toBe(PROACTIVE_REFRESH_THRESHOLD_MS);
  });

  it('returns default for negative value', () => {
    expect(getProactiveRefreshThresholdMs('-5')).toBe(PROACTIVE_REFRESH_THRESHOLD_MS);
  });

  it('accepts large values for testing', () => {
    expect(getProactiveRefreshThresholdMs('8760')).toBe(365 * 24 * 60 * 60 * 1000);
  });
});
