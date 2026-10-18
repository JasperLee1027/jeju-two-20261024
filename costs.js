'use strict';
(() => {
  const key='jeju-20261024-costs-v1',byId=id=>document.getElementById(id),fmt=n=>'NT$'+Math.round(n).toLocaleString('zh-TW'),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const defaults=[{id:'meals',name:'餐飲・四天兩人',amount:''},{id:'activities',name:'景點／牛島活動・兩人',amount:''},{id:'travel-insurance',name:'富邦產險旅平險・兩人',amount:String(confirmedTravelInsurance.total)},{id:'shopping',name:'購物與其他・兩人',amount:''},{id:'rest-cost',name:'額外補眠／入住加收（勿重複四晚房費）',amount:''}];
  let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{}
  let extras=Array.isArray(saved.customExpenses)?saved.customExpenses.filter(x=>x&&typeof x.id==='string'&&typeof x.name==='string').map(x=>({id:x.id,name:x.name,amount:typeof x.amount==='string'?x.amount:''})):defaults;
  // Replace the old insurance estimate once; preserve all unrelated expense rows.
  if(saved.confirmedInsuranceVersion!==confirmedTravelInsurance.id){
    const insurance={id:'travel-insurance',name:'富邦產險旅平險・兩人',amount:String(confirmedTravelInsurance.total)};
    const existing=extras.findIndex(e=>e.id==='travel-insurance');
    if(existing>=0)extras[existing]=insurance;else extras.push(insurance);
  }
  const insuranceDescription=confirmedTravelInsurance.insurer+' '+confirmedTravelInsurance.product+'｜'+confirmedTravelInsurance.periodLabel+'；'+confirmedTravelInsurance.timeZoneNote;
  byId('confirmed-travel-insurance').textContent='已確認保費：'+confirmedTravelInsurance.insurer+' '+confirmedTravelInsurance.product+'・兩人'+fmt(confirmedTravelInsurance.total)+'；'+confirmedTravelInsurance.periodLabel+'。'+confirmedTravelInsurance.timeZoneNote+'；與租車CDW分開計算。';
  const fields=['cost-hotel','cost-hotel-custom','cost-esim','cost-esim-count','cost-esim-custom','cost-usd','cost-jpy'];
  byId('cost-hotel').innerHTML+='<option value="custom">其他／分住住宿・填總額</option>'+budgetHotels.map(h=>`<option value="${h.id}">${esc(h.name)}${h.total?'・'+(h.nights||3)+'晚NT$'+h.total.toLocaleString('zh-TW')+(h.paid?'・已付款':'・舊比價'):'・價格待填'}</option>`).join('');
  for(const id of fields)if(typeof saved[id]==='string')byId(id).value=saved[id];
  // Apply the confirmed stay once, preserving unrelated costs and later manual comparisons.
  try{if(localStorage.getItem('jeju-20261024-paid-stay')!==confirmedStay.id){byId('cost-hotel').value=confirmedStay.id;byId('cost-hotel-custom').value='';localStorage.setItem('jeju-20261024-paid-stay',confirmedStay.id)}}catch{byId('cost-hotel').value=confirmedStay.id;byId('cost-hotel-custom').value=''}
  selected='booked';
  for(const id of ['car-model','days','rate','insurance','extras'])if(typeof saved[id]==='string')byId(id).value=saved[id];
  // Apply the couple's MINI decision once, while preserving any later manual budget changes.
  try{if(localStorage.getItem('jeju-20261024-mini-decision')!=='applied'){byId('car-model').value='102890';byId('insurance').value='';localStorage.setItem('jeju-20261024-mini-decision','applied')}}catch{byId('car-model').value='102890';byId('insurance').value=''}
  // Apply the paid Orcar package once; keep unrelated saved costs and later comparisons.
  if(saved.confirmedCarVersion!==confirmedCar.id){byId('car-model').value=confirmedCar.id;byId('insurance').value='';}
  renderFares();calculate();byId('car-model').dispatchEvent(new Event('input',{bubbles:true}));
  function amount(raw){if(raw==='')return null;const n=Number(raw);return Number.isFinite(n)&&n>=0?n:null;}
  function input(id){const e=byId(id);return e.validity.valid?amount(e.value):null;}
  function save(){const s={fare:selected,customExpenses:extras,confirmedInsuranceVersion:confirmedTravelInsurance.id,confirmedCarVersion:confirmedCar.id};for(const id of [...fields,'car-model','days','rate','insurance','extras'])s[id]=byId(id).value;try{localStorage.setItem(key,JSON.stringify(s))}catch{}}
  function renderExtra(){byId('cost-extra-rows').innerHTML=extras.map((e,i)=>`<div class="cost-extra" data-extra-id="${esc(e.id)}"><div><label for="cost-name-${i}">費用項目${i+1}</label><input id="cost-name-${i}" data-extra-field="name" maxlength="80" value="${esc(e.name)}"></div><div><label for="cost-amount-${i}">兩人總額${i+1}（NT$）</label><input id="cost-amount-${i}" data-extra-field="amount" type="number" min="0" step="1" value="${esc(e.amount)}" placeholder="尚未估"></div><button data-remove-extra="${esc(e.id)}" aria-label="移除${esc(e.name||'自訂費用')}">移除</button></div>`).join('');}
  function syncButtons(){document.querySelectorAll('[data-cost-hotel]').forEach(b=>{const active=b.dataset.costHotel===byId('cost-hotel').value;b.setAttribute('aria-pressed',String(active));b.textContent=active?'已加入預估花費':'加入預估花費'+(budgetHotels.find(h=>h.id===b.dataset.costHotel)?.total?'・'+(budgetHotels.find(h=>h.id===b.dataset.costHotel)?.nights||3)+'晚':'・金額待填')});document.querySelectorAll('[data-cost-esim]').forEach(b=>{const active=b.dataset.costEsim===byId('cost-esim').value;b.setAttribute('aria-pressed',String(active));b.textContent=active?'已加入預估花費':'加入預估花費・兩張'});}
  let currentLines=[],currentMissing=[];
  function update(){
    const rows=[],missing=[],invalid=[];const add=(name,detail,n)=>{const value=n===null?null:Math.round(n);rows.push({name,detail,value});if(value===null)missing.push(name)};
    const f=fares.find(x=>x.id===selected);add('機票',f.id==='booked'?'兩人已付金額；訂單細節待確認':f.name+'・10/12 兩人來回比價快照',f.total);
    const rental=rentalEstimate(),krw=input('rate');
    add('本島租車',rental.booked?'Orcar MINI Cooper敞篷・82小時10分・已付款，含租車保險':byId('car-model').selectedOptions[0]?.textContent+' × '+byId('days').value+'日・歷史假設比較',rental.car);
    add('CDW租車保險',rental.booked?'已含於Orcar整筆NT$12,823，不重複加算；方案與保障待核對':'租車試算韓元總保費×匯率',rental.insurance);
    add('油資／停車／機場交通','沿用交通試算的台幣總額',input('extras'));
    const h=budgetHotels.find(x=>x.id===byId('cost-hotel').value),hotelOverride=input('cost-hotel-custom'),hotelCustom=byId('cost-hotel-custom').value!==''||!byId('cost-hotel-custom').validity.valid;
    add('住宿',hotelCustom?'自訂／覆蓋住宿預算（不更動已付款訂單）':h?h.name+'・一房兩人'+(h.nights||3)+'晚'+(h.paid?'・已付款':'・舊比價'):byId('cost-hotel').value==='custom'?'其他／分住住宿，金額待填':'尚未選',hotelCustom?hotelOverride:h?.total??null);
    const plans={airalo:{name:'Airalo 5GB／7天',price:10,rate:input('cost-usd')},lg4:{name:'LG U+ 4天',price:23000,rate:krw},lg5:{name:'LG U+ 5天',price:27500,rate:krw},nomad:{name:'Nomad 5GB／30天',price:1583,rate:input('cost-jpy')}};
    const plan=plans[byId('cost-esim').value],override=input('cost-esim-custom'),count=input('cost-esim-count'),netCustom=byId('cost-esim-custom').value!==''||!byId('cost-esim-custom').validity.valid;
    add('上網',netCustom?'自訂／覆蓋網路總額':plan?plan.name+' × '+count+'張':'尚未選定／金額待填',netCustom?override:plan&&plan.rate>0&&count>0?plan.price*plan.rate*count:null);
    for(const e of extras)add(e.name.trim()||'未命名費用',e.id==='travel-insurance'?insuranceDescription:'自訂・整趟兩人總額',amount(e.amount));
    for(const id of [...fields,'days','rate','insurance','extras']){const el=byId(id);if(el.tagName==='INPUT'&&!el.disabled&&!el.validity.valid)invalid.push(el.labels?.[0]?.textContent||id)}
    if(byId('cost-usd').value!==''&&input('cost-usd')===0&&byId('cost-esim').value==='airalo')invalid.push('美元匯率需大於0');
    if(byId('cost-jpy').value!==''&&input('cost-jpy')===0&&byId('cost-esim').value==='nomad')invalid.push('日圓匯率需大於0');
    if(krw===0)invalid.push('韓元匯率需大於0');
    byId('cost-extra-rows').querySelectorAll('input').forEach(el=>{if(!el.validity.valid)invalid.push(el.labels?.[0]?.textContent||'自訂費用')});
    currentLines=rows;currentMissing=missing;const total=rows.reduce((s,r)=>s+(r.value??0),0);
    byId('trip-cost-total').textContent=fmt(total);byId('trip-cost-per').textContent=fmt(total/2);
    byId('trip-cost-rows').innerHTML=rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.detail)}</td><td>${r.value===null?'待估':fmt(r.value)}</td></tr>`).join('');
    byId('trip-cost-missing').textContent=missing.length?'尚未计入：'+missing.join('、')+'。目前不是完整旅行總額。':'目前列出的項目皆已估；仍請確認未列出的費用與實際訂單。';
    byId('trip-cost-missing').textContent=byId('trip-cost-missing').textContent.replace('计入','計入');
    byId('cost-input-error').textContent=invalid.length?'請修正：'+invalid.join('、')+'；無效金額不計入。':'';syncButtons();save();
  }
  for(const id of fields)byId(id).addEventListener('input',update);
  document.addEventListener('jeju-cost-change',update);document.addEventListener('jeju-stays-rendered',syncButtons);
  document.addEventListener('click',e=>{const hotel=e.target.closest('[data-cost-hotel]'),net=e.target.closest('[data-cost-esim]');if(hotel){byId('cost-hotel').value=hotel.dataset.costHotel;byId('cost-hotel-custom').value='';update();toast(hotel.dataset.costHotel===confirmedStay.id?'已帶入四晚住宿實付總額':'已切換住宿預算比較；實際訂單未變。')}if(net){byId('cost-esim').value=net.dataset.costEsim;byId('cost-esim-count').value='2';byId('cost-esim-custom').value='';update();toast('兩張eSIM已加入預估花費；不是購買。')}});
  byId('cost-extra-rows').addEventListener('input',e=>{const row=e.target.closest('[data-extra-id]'),field=e.target.dataset.extraField;if(!row||!field)return;const item=extras.find(x=>x.id===row.dataset.extraId);item[field]=e.target.value;if(field==='name')row.querySelector('[data-remove-extra]').setAttribute('aria-label','移除'+(item.name||'自訂費用'));if(field==='amount'&&!e.target.validity.valid)item.amount='';update()});
  byId('cost-extra-rows').addEventListener('click',e=>{const b=e.target.closest('[data-remove-extra]');if(b){extras=extras.filter(x=>x.id!==b.dataset.removeExtra);renderExtra();update()}});
  byId('cost-add-extra').addEventListener('click',()=>{extras.push({id:'custom-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),name:'自訂費用',amount:''});renderExtra();update();byId('cost-extra-rows').querySelector('.cost-extra:last-child input').focus()});
  byId('copy-costs').addEventListener('click',async()=>{const text='濟州島預估花費・兩人\n'+currentLines.map(r=>`${r.name}｜${r.detail}：${r.value===null?'待估':fmt(r.value)}`).join('\n')+'\n兩人已選小計：'+byId('trip-cost-total').textContent+'\n平均每人：'+byId('trip-cost-per').textContent+'\n'+byId('trip-cost-missing').textContent+'\n實際已付款：機票NT$26,598＋住宿四晚NT$11,375＋Orcar MINI含租車保險NT$12,823＝兩人NT$50,796；富邦旅平險NT$1,212付款狀態待確認，其餘依實際預訂狀態確認。';try{await navigator.clipboard.writeText(text);toast('花費明細已複製，可貼到共同Doc。')}catch{toast('無法複製，請選取明細手動複製。')}});
  renderExtra();update();
})();
