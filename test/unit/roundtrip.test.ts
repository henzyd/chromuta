import { describe, expect, it } from 'vitest';
import { formatColor } from '../../src/core/color/format.js';
import { parseColor } from '../../src/core/color/parse.js';
import { okLabToRgb } from '../../src/core/color/spaces.js';
import type { OutputNotation } from '../../src/core/color/types.js';

/** Deterministic PRNG so a failure is reproducible from the seed alone. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const NOTATIONS: OutputNotation[] = ['hex', 'rgb', 'hsl', 'oklch', 'oklab', 'lab', 'lch'];

describe('parse(format(c)) preserves the color', () => {
  it.each(NOTATIONS)('holds for %s across 400 random 8-bit colors', (notation) => {
    const random = makeRandom(0x5eed);
    const failures: string[] = [];

    for (let i = 0; i < 400; i++) {
      const r = Math.floor(random() * 256);
      const g = Math.floor(random() * 256);
      const b = Math.floor(random() * 256);
      const original = `rgb(${r} ${g} ${b})`;

      const color = parseColor(original)!;
      const text = formatColor(color, notation, {})!;
      const reparsed = parseColor(text);

      if (!reparsed) {
        failures.push(`${original} -> ${text} -> unparseable`);
        continue;
      }

      const rgb = okLabToRgb(reparsed.ok);
      const got: [number, number, number] = [
        Math.round(rgb.r * 255),
        Math.round(rgb.g * 255),
        Math.round(rgb.b * 255)
      ];

      if (got[0] !== r || got[1] !== g || got[2] !== b) {
        failures.push(`${original} -> ${text} -> rgb(${got.join(' ')})`);
      }
    }

    expect(failures.slice(0, 5)).toEqual([]);
  });

  it('preserves alpha', () => {
    const random = makeRandom(0xa1fa);
    for (let i = 0; i < 200; i++) {
      const alpha = Math.round(random() * 1000) / 1000;
      const color = parseColor(`rgb(10 20 30 / ${alpha})`)!;
      for (const notation of NOTATIONS) {
        const text = formatColor(color, notation, {})!;
        const back = parseColor(text)!;
        expect(Math.abs(back.alpha - alpha)).toBeLessThan(0.005);
      }
    }
  });
});
