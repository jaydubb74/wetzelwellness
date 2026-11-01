import { describe, it, expect } from 'vitest';
import { currentBlock } from '../TimeBlock.jsx';

const at = hour => new Date(2026, 10, 1, hour, 30);

describe('currentBlock', () => {
  it('maps the time of day to a block, with no gap in the afternoon', () => {
    expect(currentBlock(at(5))).toBe('morning');
    expect(currentBlock(at(9))).toBe('morning');
    expect(currentBlock(at(10))).toBe('midmorning');
    expect(currentBlock(at(12))).toBe('midday');
    expect(currentBlock(at(16))).toBe('midday');
    expect(currentBlock(at(17))).toBe('evening');
    expect(currentBlock(at(23))).toBe('evening');
  });
});
