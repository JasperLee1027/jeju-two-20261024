const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parse,link}=require('../wish-memory.js');

test('link snapshot round-trips every candidate, preserves deployment path, and opens the map',()=>{
  const ids=Array.from({length:114},(_,i)=>i+1);
  const url=new URL(link(ids.reverse(),'https://example.com/jeju/?v=latest&wishlist=v1.3#car'));
  assert.equal(url.pathname,'/jeju/');assert.equal(url.hash,'#places');assert.equal(url.searchParams.get('v'),'latest');
  assert.deepEqual(parse(url.searchParams.get('wishlist'),ids),{ids:ids.toSorted((a,b)=>a-b),unknown:0});
});
test('old, unknown and repeated IDs never create arbitrary candidate entries',()=>{
  assert.deepEqual(parse('v1.1.1.2.999',[1,2]),{ids:[1,2],unknown:1});
  assert.deepEqual(parse('v1',[1,2]),{ids:[],unknown:0});
});
test('malformed and oversized links cannot overwrite saved records',()=>{
  for(const bad of ['','v2.1','v1.0','v1.-1','v1.1.5x','v1.1e2','v1.<script>','v1'+'.1'.repeat(2100)])assert.equal(parse(bad,[1]),null);
});
