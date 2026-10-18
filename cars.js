/* Confirmed Orcar booking and separately labelled historical rental estimates. */
'use strict';
(() => {
  const choices = [
    {id:'mini-convertible',name:'MINI Cooper Convertible',label:'已訂MINI・以下為Lotte歷史費率',rate:102890,range:'₩102,890（約NT$2,469）',four:'NT$9,877',year:'Lotte 參考租金：26年式',why:'晴天沿海開篷，兩人旅行的度假感最強。',luggage:'你們的一個大箱＋一個登機箱：需店家核對箱體尺寸與開篷裝載；可能要利用後座，不能保證都放得進後車廂。',tradeoff:'開篷後行李空間縮小；風大、下雨或較冷時需關篷。',note:'開篷160L／關篷215L，為MINI官方2025款規格；實際出租年式與車況仍以訂單確認。',source:'https://faq.miniusa.com/s/article/MINI-Cooper-Convertible-from-112024-Exterior-Fabric-soft-top-MY25-U5tJs'},
    {id:'avante',name:'Hyundai Avante',label:'兩人與行李・優先比較',rate:77860,range:'₩75,780–80,540（約NT,819–1,933）',four:'NT$7,275–7,732',year:'參考租金：21–26年式，含部分油電款',why:'四門轎車，長段移動與搬行李較省事。',luggage:'一個大箱＋一個登機箱：我會優先向店家詢問這類轎車的裝載照片。',tradeoff:'車身比輕型車長；沒有開篷體驗。',note:'試算選24–25年式汽油款₩77,860（約NT$1,869）／日。'},
    {id:'k3',name:'Kia K3',label:'兩人與行李・轎車備選',rate:76560,range:'₩76,560（約NT,837）',four:'NT$7,350',year:'參考租金：22–24年式',why:'與Avante一起比較四門轎車，依庫存與含保險總價挑選。',luggage:'一個大箱＋一個登機箱：較值得優先詢問；仍依箱體外部尺寸確認。',tradeoff:'租車多為既有年式；外觀與配備依實際車輛。',note:'試算用官方22–24年式汽油款。'},
    {id:'morning',name:'Kia Morning',label:'省預算・輕型掀背',rate:69560,range:'₩69,560–70,270（約NT,669–1,686）',four:'NT$6,678–6,746',year:'參考租金：23–26年式',why:'車身小，市區停車與窄路比較容易處理。',luggage:'一個大箱＋一個登機箱：後車廂較小，可能需放倒部分後座；先看裝載尺寸。',tradeoff:'滿載行李時，空間彈性比轎車小。',note:'試算選23–25年式汽油款₩69,560（約NT$1,669）／日。'},
    {id:'ray',name:'Kia Ray',label:'方盒車・空間取向',rate:72170,range:'₩69,160–72,740（約NT,660–1,746）',four:'NT$6,639–6,983',year:'參考租金：19–26年式',why:'方正車身與較高車室，拿取行李、上下車方便。',luggage:'一個大箱＋一個登機箱：可詢問放倒後座後的裝載方式，車室高不等於後車廂很大。',tradeoff:'輕型車；遇到強側風時，舒適度需自己評估。',note:'試算選23–25年式汽油款₩72,170（約NT$1,732）／日。'},
    {id:'casper',name:'Hyundai Casper',label:'小車・休旅外型',rate:71750,range:'₩71,750–74,880（約NT,722–1,797）',four:'NT$6,888–7,188',year:'參考租金：22–26年式',why:'車身小、外型較有休旅感，適合兩人輕裝旅行。',luggage:'一個大箱＋一個登機箱：需核對後車廂與部分後座放倒的尺寸。',tradeoff:'外型像休旅車，行李空間仍屬輕型車等級。',note:'此處比較汽油Casper，照片不使用較大的Casper Electric；試算₩71,750（約NT$1,722）／日。'}
  ];
  const model=document.getElementById('car-model');
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function updateSelection(){
    document.querySelectorAll('[data-vehicle-rate]').forEach(button=>{const active=button.dataset.vehicleRate===model.value;button.setAttribute('aria-pressed',String(active));button.textContent=active?'已帶入試算':'帶入試算';button.closest('.vehicle-card').classList.toggle('is-selected',active);});
    document.getElementById('car-choice-note').textContent=model.value===confirmedCar.id?'已帶入Orcar已付款整筆NT$12,823（含租車保險）。10/24 08:20至10/27 18:30，82小時10分，皆為韓國時間；不乘日數與匯率。':'目前為歷史車款預算比較；實際已訂Orcar MINI含租車保險NT$12,823不變。';
  }
  async function render(){
    try{
      const response=await fetch('car-photos.json?v=20261012-cars');
      if(!response.ok)throw new Error('照片來源載入失敗');
      const photos=await response.json();
      const entries=Array.isArray(photos)?photos:photos.photos;
      const photoMap=new Map(entries.map(p=>[p.id,p]));
      document.getElementById('vehicle-gallery').innerHTML=choices.map(car=>{
        const photo=photoMap.get(car.id);
        if(!photo)throw new Error('缺少車款照片：'+car.id);
        return `<article class="vehicle-card ${car.id==='mini-convertible'?'vehicle-mini':''}" data-vehicle="${car.id}"><div class="vehicle-photo"><a href="${escape(photo.sourcePage)}" target="_blank" rel="noopener" aria-label="查看${escape(car.name)}照片來源"><img src="${escape(photo.src)}" alt="${escape(photo.alt)}" loading="lazy" width="800" height="450"></a><span class="vehicle-label">${escape(car.label)}</span></div><div class="vehicle-content"><h3>${escape(car.name)}</h3><p class="vehicle-price"><strong>${car.four}</strong><span>保守4日／車・未含CDW</span></p><p class="vehicle-daily">${car.range}／24小時<br>${car.year}</p><p>${car.why}</p><p class="vehicle-luggage"><strong>你們的行李</strong>${car.luggage}</p><p class="vehicle-tradeoff">${car.tradeoff}</p><details><summary>車款與照片說明</summary><p>${car.note}</p><p>${escape(photo.caption)} <a href="${escape(photo.sourcePage)}" target="_blank" rel="noopener">${escape(photo.sourceName)}照片來源 ↗</a>${car.source?` · <a href="${car.source}" target="_blank" rel="noopener">MINI官方行李規格 ↗</a>`:''}</p></details><button data-vehicle-rate="${car.rate}" aria-pressed="false">帶入試算</button></div></article>`;
      }).join('');
      document.querySelectorAll('[data-vehicle-rate]').forEach(button=>button.addEventListener('click',()=>{model.value=button.dataset.vehicleRate;model.dispatchEvent(new Event('input',{bubbles:true}));updateSelection();const car=choices.find(c=>String(c.rate)===model.value);document.getElementById('vehicle-selection-status').textContent=`已將${car.name}帶入下方兩人交通預算試算；這是歷史比較，實際已付Orcar MINI訂單不變。`;}));
      updateSelection();
    }catch(error){document.getElementById('vehicle-gallery').innerHTML='<p>車款照片暫時無法載入，請重新整理；下方表格與預算試算仍可使用。</p>';}
  }
  document.getElementById('use-booked-car').addEventListener('click',()=>{model.value=confirmedCar.id;model.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('vehicle-selection-status').textContent='已恢復Orcar已付含保險總額NT$12,823。';});
  model.addEventListener('input',updateSelection);
  render();
})();
