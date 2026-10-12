import { describe,it,expect } from 'vitest';
import { isLongForm,customFeeValid } from '@/lib/agency-rules';
describe('Video classification',()=>{it('classifies four minutes as long-form',()=>{expect(isLongForm(240)).toBe(true);expect(isLongForm(239)).toBe(false);});});
describe('Custom plan fees',()=>{it('accepts increments of 1000',()=>{expect(customFeeValid(3000)).toBe(true);expect(customFeeValid(3500)).toBe(false);});it('caps at 20000',()=>{expect(customFeeValid(20000)).toBe(true);expect(customFeeValid(21000)).toBe(false);});});