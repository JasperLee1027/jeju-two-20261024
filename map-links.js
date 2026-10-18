'use strict';
(() => {
  const clean=value=>String(value||'').trim().replace(/\s+/g,' ');
  function naverSearch(query){
    const text=clean(query);
    return text?'https://map.naver.com/p/search/'+encodeURIComponent(text):'';
  }
  function placeQuery(place){
    const address=clean(place.address);
    if(place.isBookedStay&&address)return address;
    const original=clean(place.original||place.name);
    const korean=original.split(/\s*·\s*/).find(part=>/[가-힣]/.test(part));
    const name=korean||original;
    // A branch's address keeps similarly named stores apart. Unverified addresses remain searches.
    if(address&&(/[가-힣]/.test(address)||place.branchGroup))return clean(name+' '+address);
    const region=place.area==='udo'?'우도':place.area==='gapado'?'가파도':'제주';
    return clean(name+(name.includes(region)?'':' '+region));
  }
  function placeNaverUrl(place){
    try{
      const url=new URL(place.naverMapUrl);
      if(url.protocol==='https:'&&url.hostname==='map.naver.com'&&/^\/p\/entry\/place\/\d+$/.test(url.pathname)&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash)return url.href;
    }catch{}
    return naverSearch(placeQuery(place));
  }
  function isGoogleMaps(value){
    try{
      const u=new URL(value);
      return u.hostname==='maps.app.goo.gl'||(u.hostname==='goo.gl'&&u.pathname.startsWith('/maps'))||
        (['www.google.com','google.com','www.google.com.tw','maps.google.com'].includes(u.hostname)&&
          (u.pathname.startsWith('/maps')||u.hostname==='maps.google.com'));
    }catch{return false;}
  }
  function googleQuery(value){
    if(!isGoogleMaps(value))return '';
    try{
      const u=new URL(value),query=u.searchParams.get('query')||u.searchParams.get('q');
      if(query&&!/^[-\d.]+\s*,\s*[-\d.]+$/.test(query))return clean(query);
      const match=u.pathname.match(/^\/maps\/(?:place|search)\/([^/]+)/);
      return match?clean(decodeURIComponent(match[1].replace(/\+/g,' '))):'';
    }catch{return '';}
  }
  const api={naverSearch,placeQuery,placeNaverUrl,isGoogleMaps,googleQuery};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else window.JejuMaps=api;
})();
