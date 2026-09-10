import { describe, expect, it } from 'vitest';
import { scanText } from '../../src/core/detect/scanText.js';
import { applyStyleProfile, inferStyle } from '../../src/core/detect/style.js';
import { DEFAULT_FORMAT_OPTIONS, type FormatOptions } from '../../src/core/color/types.js';

const profileOf = (source: string) => inferStyle(scanText(source, { languageId: 'css' }));

describe('style inference', () => {
  it('picks up uppercase hex', () => {
    expect(profileOf('a{color:#FFF;border-color:#3B82F6;outline-color:#AABBCC}').hexCase).toBe(
      'upper'
    );
  });

  it('picks up lowercase hex', () => {
    expect(profileOf('a{color:#fff;border-color:#3b82f6}').hexCase).toBe('lower');
  });

  it('ignores digit-only values, which carry no casing signal', () => {
    expect(profileOf('a{color:#003;border-color:#112233}').hexCase).toBeUndefined();
  });

  it('detects a preference for longhand hex', () => {
    // Both of these could have been shortened and were not.
    expect(profileOf('a{color:#ffffff;border-color:#000000}').shorthandHex).toBe(false);
  });

  it('detects a preference for shorthand hex', () => {
    expect(profileOf('a{color:#fff;border-color:#000}').shorthandHex).toBe(true);
  });

  it('detects legacy comma syntax and its spacing', () => {
    const profile = profileOf('a{color:rgba(0, 0, 0, 0.5);border-color:rgb(1, 2, 3)}');
    expect(profile.functionSyntax).toBe('legacy');
    expect(profile.spaceAfterComma).toBe(true);
  });

  it('detects tight commas', () => {
    expect(profileOf('a{color:rgba(0,0,0,.5);border-color:rgb(1,2,3)}').spaceAfterComma).toBe(
      false
    );
  });

  it('detects modern syntax', () => {
    expect(profileOf('a{color:rgb(0 0 0);border-color:hsl(1 2% 3%)}').functionSyntax).toBe(
      'modern'
    );
  });

  it('detects percentage alpha', () => {
    expect(profileOf('a{color:rgb(0 0 0 / 50%);border-color:hsl(1 2% 3% / 20%)}').alphaStyle).toBe(
      'percent'
    );
  });

  it('stays silent when the evidence is tied', () => {
    expect(profileOf('a{color:#FFF;border-color:#aabbcc}').hexCase).toBeUndefined();
  });

  it('stays silent on an empty file', () => {
    expect(inferStyle([])).toEqual({});
  });
});

describe('applying a profile', () => {
  it('fills options the user left at their default', () => {
    const result = applyStyleProfile(DEFAULT_FORMAT_OPTIONS, { hexCase: 'upper' });
    expect(result.hexCase).toBe('upper');
  });

  it('never overrides an option the user set explicitly', () => {
    const overridden = new Set<keyof FormatOptions>(['hexCase']);
    const result = applyStyleProfile(DEFAULT_FORMAT_OPTIONS, { hexCase: 'upper' }, overridden);
    expect(result.hexCase).toBe('lower');
  });

  it('does not mutate the base options', () => {
    const base = { ...DEFAULT_FORMAT_OPTIONS };
    applyStyleProfile(base, { hexCase: 'upper', functionSyntax: 'legacy' });
    expect(base.hexCase).toBe('lower');
    expect(base.functionSyntax).toBe('modern');
  });
});
