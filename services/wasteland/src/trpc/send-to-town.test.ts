import { describe, expect, it } from 'vitest';
import { formatWantedItemMessage } from './send-to-town.util';

describe('formatWantedItemMessage', () => {
  it('formats message with all fields', () => {
    const message = formatWantedItemMessage({
      itemId: 'w-abc123',
      wastelandId: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Fix critical bug',
      type: 'bug',
      priority: 'high',
      description: 'The system crashes on startup',
    });

    expect(message).toContain('Subject: Wasteland wanted item: Fix critical bug');
    expect(message).toContain('Title: Fix critical bug');
    expect(message).toContain('Type: bug');
    expect(message).toContain('Priority: high');
    expect(message).toContain('Item ID: w-abc123');
    expect(message).toContain('Wasteland ID: 550e8400-e29b-41d4-a716-446655440000');
    expect(message).toContain('The system crashes on startup');
    expect(message).toContain('gt_wasteland_claim with item_id: w-abc123');
    expect(message).toContain(
      'wasteland_origin metadata tag set to "550e8400-e29b-41d4-a716-446655440000"'
    );
  });

  it('uses N/A for missing type and priority', () => {
    const message = formatWantedItemMessage({
      itemId: 'w-xyz789',
      wastelandId: '550e8400-e29b-41d4-a716-446655440001',
      title: 'Add feature',
      type: null,
      priority: null,
      description: 'New feature request',
    });

    expect(message).toContain('Type: N/A');
    expect(message).toContain('Priority: N/A');
  });

  it('uses default description when missing', () => {
    const message = formatWantedItemMessage({
      itemId: 'w-def456',
      wastelandId: '550e8400-e29b-41d4-a716-446655440002',
      title: 'Update docs',
      description: null,
    });

    expect(message).toContain('No description provided');
  });
});
