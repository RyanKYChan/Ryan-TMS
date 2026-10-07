import { transaction } from './db.js';
import { validateUnit } from './domain.js';
import { operationalLoads } from './operations.js';
export const RATE_FIELDS=['unit_cost','load_cost','unit_revenue','load_revenue'];
export { financeReport, cents } from './finance-report.js';
export function applyLoadDefaults(db,p,id){
  const rates=db.prepare('SELECT * FROM projects WHERE id=?').get(p);
  db.prepare('UPDATE loads SET cost=?,revenue=? WHERE id=?').run(rates.load_cost,rates.load_revenue,id);
}
export function registerFinanceRoutes(app,db,{project,units,event,fail,text,now}){
  app.post('/api/projects/:p/rates',(req,res)=>{
    const p=project(req.params.p).id,rates=req.body.rates,mode=req.body.apply;
    if(!rates||!['none','fill','replace'].includes(mode))fail('Choose rates and whether to fill blanks or replace existing prices.');
    const settings={};
    for(const f of ['cost_basis','revenue_basis']){if(!['load','unit'].includes(rates[f]))fail('Choose load or unit pricing.');settings[f]=rates[f];}
    for(const f of RATE_FIELDS){settings[f]=text(rates[f]??'',30);const e=validateUnit({price:settings[f]});if(e)fail(`${f}: ${e}`);}
    const result=transaction(db,()=>{
      db.prepare(`UPDATE projects SET ${Object.keys(settings).map(f=>`${f}=?`).join(',')} WHERE id=?`).run(...Object.values(settings),p);
      let loadChanges=0,unitChanges=0;
      if(mode!=='none')for(const kind of ['cost','revenue']){
        const basis=settings[`${kind}_basis`],value=settings[`${basis}_${kind}`];if(value==='')continue;
        const table=basis==='load'?'loads':'units',field=basis==='unit'&&kind==='cost'?'price':kind;
        const records=table==='loads'?operationalLoads(db.prepare('SELECT * FROM loads WHERE project_id=?').all(p),units(p)):units(p);
        for(const row of records){if((mode==='fill'&&row[field]!=='')||row[field]===value)continue;
          if(table==='units'){db.prepare(`UPDATE units SET ${field}=?,updated_at=? WHERE id=?`).run(value,now(),row.id);unitChanges++;}
          else{db.prepare(`UPDATE loads SET ${field}=? WHERE id=?`).run(value,row.id);loadChanges++;}
        }
      }
      event(p,null,`Project rates saved (${mode}): cost per ${settings.cost_basis}, revenue per ${settings.revenue_basis}`);
      return {loadChanges,unitChanges};
    });res.json(result);
  });
  app.post('/api/projects/:p/loads/prices',(req,res)=>{
    const p=project(req.params.p).id,ids=req.body.loadIds,mode=req.body.mode;
    if(!Array.isArray(ids)||!ids.length||ids.length>10000||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length||!['fill','replace'].includes(mode))fail('Select unique loads and a pricing action.');
    const update={};for(const f of ['cost','revenue'])if(req.body[f]!==undefined){update[f]=text(req.body[f],30);if(update[f]==='')fail('Enter an amount, including 0 for zero pricing.');const e=validateUnit({[f]:update[f]});if(e)fail(e);}
    if(!Object.keys(update).length)fail('Enter load cost or revenue.');
    const selected=ids.map(id=>db.prepare('SELECT * FROM loads WHERE project_id=? AND id=?').get(p,id)||fail('Load not found.',404));
    let updated=0;transaction(db,()=>{for(const row of selected){const entries=Object.entries(update).filter(([f,v])=>row[f]!==v&&(mode==='replace'||row[f]===''));if(!entries.length)continue;db.prepare(`UPDATE loads SET ${entries.map(([f])=>`${f}=?`).join(',')} WHERE id=?`).run(...entries.map(([,v])=>v),row.id);event(p,null,`Load prices updated: ${row.reference}`);updated++;}});res.json({updated});
  });
  app.post('/api/projects/:p/alerts/resolve',(req,res)=>{
    const p=project(req.params.p).id,ids=req.body.alertIds;
    if(!Array.isArray(ids)||!ids.length||ids.length>10000||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)fail('Select unique alerts.');
    for(const id of ids)if(!db.prepare('SELECT id FROM schedule_alerts WHERE project_id=? AND id=?').get(p,id))fail('Alert not found.',404);
    transaction(db,()=>{for(const id of ids)db.prepare('UPDATE schedule_alerts SET resolved_at=? WHERE id=?').run(now(),id);event(p,null,`Marked ${ids.length} schedule changes as followed up`);});res.json({resolved:ids.length});
  });
}
