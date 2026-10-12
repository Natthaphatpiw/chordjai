import {describe,it,expect} from 'vitest';
import {canonicalJson,sha256} from './dataset';
describe('Dataset manifest canonical hashes',()=>{
  it('ignores object key order but preserves sample order and Unicode',()=>{expect(canonicalJson({z:1,a:{b:'น้อง',a:true},samples:[2,1]})).toBe('{"a":{"a":true,"b":"น้อง"},"samples":[2,1],"z":1}');expect(sha256(canonicalJson({b:2,a:1}))).toBe(sha256(canonicalJson({a:1,b:2})));expect(sha256(canonicalJson([1,2]))).not.toBe(sha256(canonicalJson([2,1])));});
  it('refuses NaN/floating metadata instead of minting ambiguous hashes',()=>{expect(()=>canonicalJson({score:NaN})).toThrow();expect(()=>canonicalJson({score:0.2})).toThrow();});
});
