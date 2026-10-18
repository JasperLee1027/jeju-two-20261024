/* Shared budget schema and three-way merges; also bundled into Apps Script. */
'use strict';
var JejuCostModel=(()=>{
  const fields=['fare','car-model','days','rate','insurance','extras','cost-hotel','cost-hotel-custom','cost-esim','cost-esim-count','cost-esim-custom','cost-usd','cost-jpy'];
  const numberFields=new Set(['days','rate','insurance','extras','cost-hotel-custom','cost-esim-custom','cost-usd','cost-jpy']);
  const copy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function normalize(value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_BUDGET');
    const result={};
    for(const field of fields){
      const text=value[field];
      if(typeof text!=='string'||text.length>120)throw new Error('INVALID_BUDGET');
      if(numberFields.has(field)&&text!==''&&(!/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)||!Number.isFinite(Number(text))||Number(text)<0||Number(text)>1e9))throw new Error('INVALID_AMOUNT');
      result[field]=text;
    }
    if(!Array.isArray(value.customExpenses)||value.customExpenses.length>200)throw new Error('TOO_MANY_EXPENSES');
    const seen=new Set();
    result.customExpenses=value.customExpenses.map(row=>{
      if(!row||typeof row.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(row.id)||['__proto__','constructor','prototype'].includes(row.id)||seen.has(row.id)||typeof row.name!=='string'||row.name.length>80||typeof row.amount!=='string'||row.amount.length>32)throw new Error('INVALID_EXPENSE');
      if(row.amount!==''&&(!/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(row.amount)||!Number.isFinite(Number(row.amount))||Number(row.amount)<0||Number(row.amount)>1e9))throw new Error('INVALID_AMOUNT');
      seen.add(row.id);return {id:row.id,name:row.name,amount:row.amount};
    });
    if(JSON.stringify(result).length>45000)throw new Error('BUDGET_TOO_LARGE');
    return result;
  }
  function merge(base,local,remote){
    base=normalize(base);local=normalize(local);remote=normalize(remote);
    const snapshot=copy(remote),conflicts=[];
    function pick(b,l,r,conflict){
      if(same(l,r))return copy(l);
      if(same(l,b))return copy(r);
      if(same(r,b))return copy(l);
      conflicts.push({...conflict,local:copy(l),remote:copy(r)});return copy(r);
    }
    for(const field of fields)snapshot[field]=pick(base[field],local[field],remote[field],{kind:'field',field,label:field});
    const toMap=rows=>new Map(rows.map(row=>[row.id,row]));
    const b=toMap(base.customExpenses),l=toMap(local.customExpenses),r=toMap(remote.customExpenses);
    const order=[...new Set([...r.keys(),...l.keys(),...b.keys()])],rows=[];
    for(const id of order){
      const before=b.get(id),mine=l.get(id),theirs=r.get(id);
      if(!mine&&!theirs)continue;
      const name=mine?.name||theirs?.name||before?.name||'未命名費用';
      if(!mine||!theirs){
        const row=pick(before,mine,theirs,{kind:'row-presence',id,label:name});if(row)rows.push(row);continue;
      }
      const row={id};
      for(const field of ['name','amount'])row[field]=pick(before?.[field],mine[field],theirs[field],{kind:'row',id,field,label:name+(field==='name'?'・名稱':'・金額')});
      rows.push(row);
    }
    snapshot.customExpenses=rows;return {snapshot:normalize(snapshot),conflicts};
  }
  function resolve(result,side){
    if(!['local','remote'].includes(side))throw new Error('INVALID_RESOLUTION');
    const snapshot=copy(result.snapshot);
    for(const c of result.conflicts){
      const value=copy(c[side]);
      if(c.kind==='field')snapshot[c.field]=value;
      else if(c.kind==='row-presence'){
        const index=snapshot.customExpenses.findIndex(r=>r.id===c.id);
        if(value){if(index>=0)snapshot.customExpenses[index]=value;else snapshot.customExpenses.push(value);}
        else if(index>=0)snapshot.customExpenses.splice(index,1);
      }else{const row=snapshot.customExpenses.find(r=>r.id===c.id);if(row)row[c.field]=value;}
    }
    return normalize(snapshot);
  }
  return {fields,normalize,merge,resolve,same,copy};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=JejuCostModel;
