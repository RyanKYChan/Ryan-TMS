import { operationalLoads } from './operations.js';
export const cents=v=>v===''||v===undefined||v===null?null:Math.round(Number(v)*100);
export function financeReport(project,loads,units){
  const active=operationalLoads(loads,units),used=new Set(active.map(l=>l.id));
  const rows=active.map(l=>({id:l.id,reference:l.reference,carrier:l.carrier,load:l,units:units.filter(u=>u.load_id===l.id)}));
  const unbuilt=units.filter(u=>!used.has(u.load_id));
  if(unbuilt.length)rows.push({id:null,reference:'VINs without an operational load',carrier:'',load:null,units:unbuilt});
  const value=(row,kind)=>project[`${kind}_basis`]==='load'?(row.load?{amount:cents(row.load[kind==='cost'?'cost':'revenue'])??0,missing:row.load[kind==='cost'?'cost':'revenue']===''?1:0}: {amount:0,missing:0}):row.units.reduce((a,u)=>{const v=cents(u[kind==='cost'?'price':'revenue']);return {amount:a.amount+(v??0),missing:a.missing+(v===null?1:0)};},{amount:0,missing:0});
  const report=rows.map(row=>{const cost=value(row,'cost'),revenue=value(row,'revenue');return {...row,cost:cost.amount,revenue:revenue.amount,margin:revenue.amount-cost.amount,missingCost:cost.missing,missingRevenue:revenue.missing};});
  const totals=report.reduce((a,r)=>({cost:a.cost+r.cost,revenue:a.revenue+r.revenue,margin:a.margin+r.margin,missingCost:a.missingCost+r.missingCost,missingRevenue:a.missingRevenue+r.missingRevenue}),{cost:0,revenue:0,margin:0,missingCost:0,missingRevenue:0});
  return {rows:report,totals,unbuilt:unbuilt.length};
}
