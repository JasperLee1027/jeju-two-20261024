const {test}=require('node:test');
const assert=require('node:assert/strict');
const maps=require('../map-links.js');
const data=require('../candidates.json');

test('all candidate targets produce encoded Naver searches without changing their Google URLs',()=>{
 for(const p of data.places){
  const query=maps.placeQuery(p),url=new URL(maps.naverSearch(query));
  assert.equal(url.hostname,'map.naver.com');assert.equal(decodeURIComponent(url.pathname.slice('/p/search/'.length)),query);
  assert.ok(maps.isGoogleMaps(p.originalMapUrl));
 }
});
test('every branch uses its specific address and the booked stay uses its confirmed address',()=>{
 for(const p of data.places.filter(p=>p.branchGroup))assert.ok(maps.placeQuery(p).includes(p.address),p.name);
 const h=data.places.find(p=>p.isBookedStay);assert.equal(maps.placeQuery(h),h.address);
});
test('Korean venue names are preferred over bilingual headings and Latin addresses',()=>{
 assert.equal(maps.placeQuery({original:'Aewol Cafe Street · 애월 카페거리',address:'Aewol-ro 1-gil',area:'west'}),'애월 카페거리 제주');
 assert.equal(maps.placeQuery({original:'우도아이',area:'udo'}),'우도아이');
});
test('Google search/place targets are decoded; opaque short links need known venue context',()=>{
 assert.equal(maps.googleQuery('https://www.google.com/maps/search/?api=1&query=코코나라+우도'),'코코나라 우도');
 assert.equal(maps.googleQuery('https://www.google.com/maps/place/London+Bagel+Museum+Jeju/data=x'),'London Bagel Museum Jeju');
 assert.equal(maps.googleQuery('https://maps.app.goo.gl/opaque'),'');
 assert.equal(maps.googleQuery('https://www.google.com/maps/search/?query=33.50,126.90'),'');
});
test('non-map Google links and malformed URLs do not become map links',()=>{
 for(const url of ['https://www.google.com/travel/flights/','https://docs.google.com/document/d/example','https://photos.google.com/example','invalid'])assert.equal(maps.isGoogleMaps(url),false);
 assert.equal(maps.naverSearch(''),'');
});

test('verified Naver place links open the specific store; other targets fall back to venue searches',()=>{
 const merged=data.places.find(p=>p.id===11);
 assert.equal(maps.placeNaverUrl(merged),'https://map.naver.com/p/entry/place/1422544447');
 for(const target of ['javascript:alert(1)','https://example.com/p/entry/place/123','https://map.naver.com/p/entry/place/123?redirect=other','https://map.naver.com.evil.example/p/entry/place/123']){
  const p={original:'카페',area:'east',naverMapUrl:target};
  assert.equal(maps.placeNaverUrl(p),maps.naverSearch(maps.placeQuery(p)));
 }
});
