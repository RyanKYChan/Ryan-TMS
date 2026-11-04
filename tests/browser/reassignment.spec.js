import { test, expect } from '@playwright/test';

test('Bulk reassign across pages, then confirm carrier changes detected in another carrier’s paste',async({page,request})=>{
  const p=await (await request.post('/api/projects',{data:{name:`Reassignment ${Date.now()}`}})).json(),base=`/api/projects/${p.id}`;
  const vins=Array.from({length:60},(_,i)=>`LSFAM11A1RA${String(i+1).padStart(6,'0')}`);
  await request.post(base+'/import',{data:{packingList:'Original manifest',rows:vins.map(vin=>({vin,carrier:'Original carrier',notes:'Keep this note'}))}});
  const b=await (await request.post(base+'/carriers',{data:{name:'Better carrier'}})).json();
  await page.addInitScript(id=>localStorage.setItem('ryan-project',id),p.id);await page.goto('/');await page.getByRole('button',{name:/^Unit register/}).click();
  await page.getByLabel('Rows per page').selectOption('50');await page.getByRole('checkbox',{name:'Select this page'}).check();await page.getByRole('button',{name:'Select all 60 matching vehicles'}).click();
  await page.getByRole('button',{name:'Assign / change carrier',exact:true}).click();await page.getByLabel('Assign carrier *',{exact:true}).selectOption(b.id);await page.getByRole('button',{name:'Review assignments'}).click();
  await expect(page.getByRole('dialog').locator('tbody tr')).toHaveCount(60);await expect(page.getByRole('dialog')).toContainText('Original carrier');
  await page.getByRole('button',{name:'Confirm assignment · 60 VINs'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  let w=await (await request.get(base+'/workspace')).json();expect(w.units.every(u=>u.carrier==='Better carrier'&&u.notes==='Keep this note')).toBe(true);
  await page.getByRole('button',{name:/^Carriers/}).click();await page.getByLabel('Carrier workspace').selectOption(w.carriers.find(c=>c.name==='Original carrier').id);
  await page.getByRole('button',{name:'Paste sheet update'}).click();await page.getByLabel('Paste carrier sheet').fill(`VIN\tETD\n${vins[0]}\t20/11/2026\n${vins[1]}\t20/11/2026`);await page.getByRole('button',{name:'Review changes'}).click();
  await expect(page.getByRole('dialog')).toContainText('2 carrier assignment changes');await expect(page.getByRole('button',{name:'Apply update · 2 changed'})).toBeDisabled();
  await page.getByRole('checkbox',{name:'Confirm assignment changes for all 2 VINs'}).check();await page.getByRole('button',{name:'Apply update · 2 changed'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  w=await (await request.get(base+'/workspace')).json();expect(w.units.slice(0,2).every(u=>u.carrier==='Original carrier'&&u.etd&&u.notes==='Keep this note')).toBe(true);expect(w.units.slice(2).every(u=>u.carrier==='Better carrier')).toBe(true);
});
