import { test, expect } from '@playwright/test';
test.beforeEach(async({page,request})=>{
  const response=await request.post('/api/projects',{data:{name:`Browser test ${Date.now()}`,customer:'TEST DATA',target:400}});
  const p=await response.json();expect(response.status()).toBe(201);
  await page.addInitScript(id=>localStorage.setItem('ryan-project',id),p.id);
  await page.goto('/');await expect(page.getByRole('heading',{name:'Operations overview'})).toBeVisible();
  await expect(page.getByText('Your next movement')).toBeVisible();
});
test('Paste sheet → build load → assign → depart → deliver → reload → export',async({page})=>{
  const browserErrors=[];page.on('pageerror',e=>browserErrors.push(e.message));
  await page.getByRole('button',{name:'Import units',exact:true}).click();
  await page.getByLabel('Packing list name *',{exact:true}).fill('MAXUS · Vessel 01');
  await page.getByLabel('Paste sheet data').fill('Brand\tVIN\tModel\tReference\tComments\tPort Comment\tPOL-COUNTRY\tPOL-CTY\tPOL-ZIPCODE\tPOD-COUNTRY\tPOD-CITY\tDealer name\tcarrier\tTruck plate\tPrice(EUR)\tT1\nMAXUS\tLSFAM11A1RA000001\tDeliver 9\tREF001\tKeys checked\tAt port\tBE\tZeebrugge\t8380\tNL\tUtrecht\tDealer A\tCarrier A\tAB-123\t95,50\tYes\nMAXUS\tLSFAM11A1RA000002\tMIFA 9\tREF002\t\t\tBE\tZeebrugge\t8380\tNL\tUtrecht\tDealer B\tCarrier A\tAB-123\t105,50\tNo');
  await page.getByRole('button',{name:'Review data'}).click();
  await expect(page.getByText('Rows to fix')).toBeVisible();
  await page.getByRole('button',{name:'Import 2 units',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:/^Load builds/}).click();await page.getByRole('button',{name:'New load',exact:true}).click();
  await page.getByLabel('Load reference *',{exact:true}).fill('MX-001');await page.getByLabel('Carrier',{exact:true}).fill('Carrier A');
  await page.getByLabel('Truck plate',{exact:true}).fill('AB-123');await page.getByLabel('Origin / POL city').fill('Zeebrugge');await page.getByLabel('Destination / POD city').fill('Utrecht');
  await page.getByLabel('ETD · Estimated departure',{exact:true}).fill('2026-10-12T08:00');await page.getByLabel('ETA · Estimated arrival',{exact:true}).fill('2026-10-13T12:00');
  await page.getByRole('button',{name:'Create load',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:/^Unit register/}).click();await page.getByRole('checkbox',{name:'Select this page'}).check();
  await page.getByRole('button',{name:'Assign to load',exact:true}).click();await page.getByLabel('Load *',{exact:true}).selectOption({label:'MX-001 · 8 spaces'});
  await page.getByRole('button',{name:'Assign vehicles'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('tbody .badge.scheduled')).toHaveCount(2);
  await page.getByRole('button',{name:'MX-001',exact:true}).first().click();
  await page.getByLabel('Actual date and time',{exact:true}).fill('2026-10-12T09:00');await page.getByRole('button',{name:'Record',exact:true}).click();
  await expect(page.getByRole('dialog').locator('tbody .badge.in_transit')).toHaveCount(2);
  await page.getByLabel('Record for units missing this milestone').selectOption('ata');await page.getByLabel('Actual date and time',{exact:true}).fill('2026-10-13T13:00');await page.getByRole('button',{name:'Record',exact:true}).click();
  await expect(page.getByRole('dialog').locator('tbody .badge.delivered')).toHaveCount(2);await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'LSFAM11A1RA000001',exact:true}).click();
  await expect(page.getByLabel('Comments & port comments')).toHaveValue('Keys checked\nAt port');await expect(page.getByLabel('Price (EUR)',{exact:true})).toHaveValue('95.50');
  await expect(page.getByLabel('T1 customs document')).toHaveValue('yes');await expect(page.getByLabel('ATA · Actual arrival')).toHaveValue('2026-10-13T13:00');
  await page.getByLabel('Comments & port comments').fill('Delivery signed');await page.getByRole('button',{name:'Save changes'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();await page.getByRole('button',{name:/^Unit register/}).click();await expect(page.locator('tbody .badge.delivered')).toHaveCount(2);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Export CSV'}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe('units.csv');
  expect(browserErrors).toEqual([]);
});
test('Import preview prevents invalid VINs and an existing VIN updates without duplication',async({page})=>{
  await page.getByRole('button',{name:'Import units',exact:true}).click();await page.getByLabel('Packing list name *').fill('VIN paste');
  await page.getByLabel('Paste sheet data').fill('LSFAM11A1RA000001\nBAD');await page.getByRole('button',{name:'Review data'}).click();
  await expect(page.getByRole('button',{name:'Import 2 units'})).toBeDisabled();await expect(page.getByRole('alert')).toContainText('Fix 1 row');
  await page.getByRole('button',{name:'Back to paste'}).click();await page.getByLabel('Paste sheet data').fill('LSFAM11A1RA000001');await page.getByRole('button',{name:'Review data'}).click();await page.getByRole('button',{name:'Import 1 units'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Import units',exact:true}).click();await page.getByLabel('Packing list name *').fill('VIN paste');await page.getByLabel('Paste sheet data').fill('VIN\tModel\nLSFAM11A1RA000001\tDeliver 9');await page.getByRole('button',{name:'Review data'}).click();await expect(page.getByText('Update',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Import 1 units'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:/^Unit register/}).click();await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.getByText('Deliver 9',{exact:true})).toBeVisible();
});
test('New projects remain separate and mobile navigation/import work without page overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('button',{name:'New project',exact:true}).click();
  await page.getByLabel('Project name *',{exact:true}).fill('Next shunting project');await page.getByLabel('Customer / brand').fill('Fleet B');await page.getByLabel('Expected units *').fill('120');await page.getByRole('button',{name:'Create project',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  // Close the mobile navigation after creating the project if it remains open.
  const backdrop=page.getByRole('button',{name:'Close navigation'});if(await backdrop.isVisible())await backdrop.click();
  await expect(page.getByRole('heading',{name:'Next shunting project'})).toBeVisible();await expect(page.getByText('120 expected vehicles')).toBeVisible();
  await page.getByRole('button',{name:'Import units',exact:true}).click();await page.getByLabel('Packing list name *').fill('Mobile paste');await page.getByLabel('Paste sheet data').fill('LSFAM11A1RA000010');await page.getByRole('button',{name:'Review data'}).click();await page.getByRole('button',{name:'Import 1 units'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'.local/screenshots/mobile.png',fullPage:true});
});
test('Sample project has working load cards and clearly marked demonstration data',async({page})=>{
  await page.getByRole('button',{name:'Explore a sample project'}).click();await expect(page.getByText('Sample project · All vehicles',{exact:false})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Demo · Maxus transport'})).toBeVisible();await expect(page.locator('.load-card')).toHaveCount(3);
  await expect(page.locator('.metric-value').first()).toContainText('24');
  await page.screenshot({path:'.local/screenshots/desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Import units',exact:true}).click();await page.getByLabel('Packing list name *').fill('Test paste');await page.getByLabel('Paste sheet data').fill('LSFAM11A1RA000099');await page.getByRole('button',{name:'Review data'}).click();await page.screenshot({path:'.local/screenshots/import.png',fullPage:true});
});
test('The customer’s raw table fills Loading / Unloading addresses and city/postcode automatically',async({page})=>{
  await page.getByRole('button',{name:'Import units',exact:true}).click();await page.getByLabel('Packing list name *').fill('Generic packing list');
  await page.getByLabel('Paste sheet data').fill('| VIN No | Model | Loading | Unloading |\n| --- | --- | --- | --- |\n| LB3P11SD4TH395104 | P145 | Pantank Haven 1223, Hazopweg 163, 9130 Kallo | Canada quay 527, CLdN Ports Zeebrugge NV, Barlenhuisstraat 2, 8380 Zeebrugge |');
  await expect(page.getByText('4 columns recognised',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Review data'}).click();
  await expect(page.locator('.preview-table')).toContainText('Kallo');await expect(page.locator('.preview-table')).toContainText('Zeebrugge');await page.getByRole('button',{name:'Import 1 units'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:/^Unit register/}).click();await page.getByRole('button',{name:'LB3P11SD4TH395104',exact:true}).click();
  const pol=page.getByRole('dialog').locator('.form-grid').nth(1),pod=page.getByRole('dialog').locator('.form-grid').nth(2);
  await expect(pol.getByLabel('City',{exact:true})).toHaveValue('Kallo');await expect(pol.getByLabel('Postcode',{exact:true})).toHaveValue('9130');await expect(pol.getByLabel('Address',{exact:true})).toHaveValue('Pantank Haven 1223, Hazopweg 163, 9130 Kallo');
  await expect(pod.getByLabel('City',{exact:true})).toHaveValue('Zeebrugge');await expect(pod.getByLabel('Postcode',{exact:true})).toHaveValue('8380');
});
test('Shared import details fill a VIN-only list and retain supplied cells',async({page})=>{
  await page.getByRole('button',{name:'Import units',exact:true}).click();await page.getByLabel('Packing list name *').fill('Shared route');
  await page.getByLabel('Paste sheet data').fill('VIN No\tPOL-CITY\nLSFAM11A1RA000001\tAntwerp\nLSFAM11A1RA000002\t');
  await page.getByText('Shared POL / POD details · fill missing cells for the whole list',{exact:true}).click();
  await page.getByLabel('POL city',{exact:true}).fill('Kallo');await page.getByLabel('POD address',{exact:true}).fill('Port road, 8380 Zeebrugge');
  await page.getByRole('button',{name:'Review data'}).click();await page.getByRole('button',{name:'Import 2 units'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const p=await page.getByLabel('Active project').inputValue();const w=await (await page.request.get(`/api/projects/${p}/workspace`)).json();
  expect(w.units.find(u=>u.vin.endsWith('000001')).origin).toBe('Antwerp');expect(w.units.find(u=>u.vin.endsWith('000002')).origin).toBe('Kallo');expect(w.units.every(u=>u.destination==='Zeebrugge')).toBe(true);
});
test('A custom header mapping is remembered for the next packing list',async({page})=>{
  for(const [i,vin] of ['LSFAM11A1RA000001','LSFAM11A1RA000002'].entries()){
    await page.getByRole('button',{name:'Import units',exact:true}).click();await page.getByLabel('Packing list name *').fill(`Custom ${i}`);await page.getByLabel('Paste sheet data').fill(`VIN No\tArrival yard\n${vin}\tPort road, 8380 Zeebrugge`);await page.getByRole('button',{name:'Review data'}).click();
    if(i===0)await page.getByLabel('Arrival yard',{exact:true}).selectOption('pod_address');
    else await expect(page.getByLabel('Arrival yard',{exact:true})).toHaveValue('pod_address');
    await page.getByRole('button',{name:'Import 1 units'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  const p=await page.getByLabel('Active project').inputValue();const w=await (await page.request.get(`/api/projects/${p}/workspace`)).json();expect(w.units.length).toBe(2);expect(w.units.every(u=>u.destination==='Zeebrugge')).toBe(true);
});
test('Bulk editing all matching vehicles spans pages and preserves fields not selected',async({page})=>{
  const p=await page.getByLabel('Active project').inputValue();
  await page.request.post(`/api/projects/${p}/import`,{data:{packingList:'Bulk list',rows:Array.from({length:51},(_,i)=>({vin:`LSFAM11A1RA${String(i+1).padStart(6,'0')}`,origin:i===0?'Existing origin':'',notes:'Keep notes'}))}});
  await page.getByRole('button',{name:'Refresh workspace'}).click();await page.getByRole('button',{name:/^Unit register/}).click();await page.getByLabel('Rows per page').selectOption('50');await page.getByRole('checkbox',{name:'Select this page'}).check();await page.getByRole('button',{name:'Select all 51 matching vehicles'}).click();await page.getByRole('button',{name:'Bulk edit',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Bulk edit 51 vehicles'})).toBeVisible();await page.getByLabel('Action 1').selectOption('fill');await page.getByLabel('Value 1').fill('Kallo');
  await page.getByRole('button',{name:'Add another field'}).click();await page.getByLabel('Field 2',{exact:true}).selectOption('destination');await page.getByLabel('Value 2',{exact:true}).fill('Zeebrugge');
  await expect(page.getByRole('button',{name:'Apply to 51 vehicles'})).toBeEnabled();await page.screenshot({path:'.local/screenshots/bulk-edit.png',fullPage:true});await page.getByRole('button',{name:'Apply to 51 vehicles'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const w=await (await page.request.get(`/api/projects/${p}/workspace`)).json();expect(w.units[0].origin).toBe('Existing origin');expect(w.units[50].origin).toBe('Kallo');expect(w.units.every(u=>u.destination==='Zeebrugge'&&u.notes==='Keep notes')).toBe(true);
});

test('400 VINs show on one page and batches of 200 assign to separate carrier workspaces in packing-list order',async({page})=>{
  const browserErrors=[];page.on('pageerror',e=>browserErrors.push(e.message));
  const p=await page.getByLabel('Active project').inputValue();
  const rows=Array.from({length:400},(_,i)=>({vin:`LSFAM11A1RA${String(400-i).padStart(6,'0')}`,origin:'Kallo',destination:'Zeebrugge'}));
  await page.request.post(`/api/projects/${p}/import`,{data:{packingList:'Original packing order',rows}});
  await page.getByRole('button',{name:'Refresh workspace'}).click();await page.getByRole('button',{name:/^Unit register/}).click();
  await expect(page.locator('tbody tr')).toHaveCount(200);await page.getByLabel('Rows per page').selectOption('all');await expect(page.locator('tbody tr')).toHaveCount(400);
  await expect(page.locator('tbody .vin-link').first()).toHaveText(rows[0].vin);await expect(page.locator('tbody .vin-link').last()).toHaveText(rows[399].vin);
  await page.getByLabel('Number of VINs to select').fill('200');await page.getByRole('button',{name:'Select 200 VINs',exact:true}).click();
  await expect(page.locator('.row-selected')).toHaveCount(200);await page.getByRole('button',{name:'Assign to carrier',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText(rows[0].vin);await expect(page.getByRole('dialog')).toContainText(rows[199].vin);
  await page.getByLabel('Carrier name *',{exact:true}).fill('Carrier A');await page.getByRole('button',{name:'Assign 200 vehicles',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Select 200 VINs',exact:true}).click();await expect(page.locator('.row-selected .vin-link').first()).toHaveText(rows[200].vin);
  await page.getByRole('button',{name:'Assign to carrier',exact:true}).click();await page.getByLabel('Assign carrier *',{exact:true}).selectOption('new');await page.getByLabel('Carrier name *',{exact:true}).fill('Carrier B');await page.getByRole('button',{name:'Assign 200 vehicles',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:/^Carriers/}).click();await expect(page.getByRole('heading',{name:'Carrier operations'})).toBeVisible();
  await page.getByRole('button',{name:'Open Carrier A',exact:true}).click();await expect(page.locator('.carrier-unit-table tbody tr')).toHaveCount(200);
  await expect(page.locator('.carrier-unit-table tbody .vin-link').first()).toHaveText(rows[0].vin);await expect(page.getByRole('button',{name:'Paste sheet update'})).toBeEnabled();
  await page.screenshot({path:'.local/screenshots/carrier-workspace.png',fullPage:false});
  await page.getByLabel('Carrier workspace').selectOption({label:'Carrier B'});await expect(page.locator('.carrier-unit-table tbody .vin-link').first()).toHaveText(rows[200].vin);
  await page.getByRole('button',{name:'Open register for selection / bulk edit'}).click();await expect(page.locator('tbody tr')).toHaveCount(200);
  await expect(page.getByLabel('Filter carrier')).not.toHaveValue('all');expect(browserErrors).toEqual([]);
});

test('Carrier sheet gaps preview load builds; later milestone pastes reuse VINs and update progress',async({page})=>{
  const p=await page.getByLabel('Active project').inputValue(),vins=[1,2,3,4].map(i=>`LSFAM11A1RA${String(i).padStart(6,'0')}`);
  await page.request.post(`/api/projects/${p}/import`,{data:{packingList:'Daily carrier test',rows:vins.map(vin=>({vin,notes:'Original note'}))}});
  await page.getByRole('button',{name:'Refresh workspace'}).click();await page.getByRole('button',{name:/^Unit register/}).click();await page.getByLabel('Number of VINs to select').fill('4');await page.getByRole('button',{name:'Select 4 VINs',exact:true}).click();await page.getByRole('button',{name:'Assign to carrier',exact:true}).click();await page.getByLabel('Carrier name *').fill('Daily Carrier');await page.getByRole('button',{name:'Assign 4 vehicles',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:/^Carriers/}).click();await page.getByRole('button',{name:'Open Daily Carrier',exact:true}).click();
  const sheet=(actual=false)=>'VIN No\tETD\tETA\tATD\tATA\tComments\n'+vins.map((vin,i)=>(i===2?'\n':'')+`${vin}\t${actual?'':'12/10/2026 08:00'}\t13/10/2026 12:00\t${actual?'12/10/2026 09:00':''}\t${actual?'13/10/2026 13:00':''}\t`).join('\n');
  async function paste(actual=false){await page.getByRole('button',{name:'Paste sheet update'}).click();await page.getByLabel('Paste carrier sheet').fill(sheet(actual));await page.getByRole('button',{name:'Review changes'}).click();await expect(page.getByText('New load builds',{exact:true})).toBeVisible();}
  await paste();await expect(page.locator('.proposed-load')).toHaveCount(2);await expect(page.getByRole('dialog').locator('.review-summary')).toContainText('2New load builds');await expect(page.getByRole('dialog').locator('.changes-table .badge.scheduled')).toHaveCount(4);
  await page.screenshot({path:'.local/screenshots/carrier-update-review.png',fullPage:true});await page.getByRole('button',{name:'Apply update · 4 changed',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.carrier-unit-table .badge.scheduled')).toHaveCount(4);
  await paste(true);await expect(page.getByRole('dialog').locator('.review-summary')).toContainText('0New load builds');await expect(page.getByRole('dialog').locator('.changes-table .badge.delivered')).toHaveCount(4);await page.getByRole('button',{name:'Apply update · 4 changed',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.carrier-unit-table .badge.delivered')).toHaveCount(4);
  await paste(true);await page.getByRole('button',{name:'Apply update · 0 changed',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.carrier-history tbody tr')).toHaveCount(3);
  const w=await (await page.request.get(`/api/projects/${p}/workspace`)).json();expect(w.units.length).toBe(4);expect(w.loads.length).toBe(2);expect(w.units.every(u=>u.notes==='Original note'&&u.etd&&u.atd&&u.ata&&u.packing_list==='Daily carrier test')).toBe(true);
});

test('Carrier paste blocks unassigned VINs and a new carrier can be added without selecting vehicles',async({page})=>{
  const p=await page.getByLabel('Active project').inputValue();await page.request.post(`/api/projects/${p}/import`,{data:{packingList:'Known VIN',rows:[{vin:'LSFAM11A1RA000001',carrier:'Known Carrier'}]}});
  await page.getByRole('button',{name:'Refresh workspace'}).click();await page.getByRole('button',{name:/^Carriers/}).click();await page.getByRole('button',{name:'New carrier',exact:true}).click();await page.getByLabel('Carrier name *').fill('Second Carrier');await page.getByRole('dialog').getByRole('button',{name:'Add carrier',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Open Known Carrier',exact:true}).click();await page.getByRole('button',{name:'Paste sheet update'}).click();await page.getByLabel('Paste carrier sheet').fill('VIN\tETA\nLSFAM11A1RA000002\t13/10/2026');await expect(page.getByRole('alert')).toContainText('Not in the packing list');await expect(page.getByRole('button',{name:'Review changes'})).toBeDisabled();await page.getByRole('button',{name:'Close dialog'}).click();
  const w=await (await page.request.get(`/api/projects/${p}/workspace`)).json();expect(w.carriers).toHaveLength(2);expect(w.units).toHaveLength(1);
});

test('Load builds chooses a carrier and repeatedly reads a full 200-VIN sheet with twelve loads and an unbuilt remainder',async({page})=>{
  test.setTimeout(60000);
  const p=await page.getByLabel('Active project').inputValue(),vins=Array.from({length:200},(_,i)=>`LSFAM11A1RA${String(i+1).padStart(6,'0')}`);
  await page.request.post(`/api/projects/${p}/import`,{data:{packingList:'Full source batch',rows:vins.map(vin=>({vin,carrier:'Valida',notes:'Keep original note'}))}});
  await page.getByRole('button',{name:'Refresh workspace'}).click();await page.getByRole('button',{name:/^Load builds/}).click();
  await page.getByRole('button',{name:/^Valida/}).click();await expect(page.getByRole('button',{name:'Paste full batch for Valida'})).toBeEnabled();
  const header='Brand\tVIN\tModel\tAppointment #\tComments\tPOL-COUNTRY\tPOL-CITY\tPOL-ADDRESS\tPOD-COUNTRY\tPOD-CITY\tPOD-ADDRESS\tETD\tATD\tETA\tATA\tTruck plate\t\t';
  const sheet=(built=72,actual=false)=>header+'\n'+vins.map((vin,i)=>(i>0&&i<built&&i%6===0?'\t\t\n':'')+['Geely',vin,'P145','','','Belgium','Antwerp','Port street','Belgium','Zeebrugge','Quay street',i<built?'2026/10/07':'',actual&&i<6?'2026/10/07 09:00':'',i<built?'2026/10/07 12:00':'',actual&&i<6?'2026/10/07 11:00':'',i<built?'TEST-01':'','',''].join('\t')).join('\n')+'\n'+'\t\t\n'.repeat(800);
  await page.getByRole('button',{name:'Paste full batch for Valida'}).click();await page.getByLabel('Paste carrier sheet').fill(sheet());
  await expect(page.getByRole('dialog').locator('.review-summary')).toContainText('12Detected loads');await expect(page.getByRole('dialog').locator('.review-summary')).toContainText('128Not load built');
  await expect(page.getByRole('dialog').locator('.sheet-table tbody tr')).toHaveCount(200);await expect(page.getByRole('dialog').getByLabel('Appointment #',{exact:true})).toHaveValue('reference');
  await page.getByRole('button',{name:'Review changes'}).click();await expect(page.locator('.proposed-load')).toHaveCount(12);await expect(page.getByRole('dialog').locator('.changes-table tbody tr')).toHaveCount(200);await expect(page.getByRole('dialog').locator('.review-summary')).toContainText('128Not load built');
  await page.screenshot({path:'.local/screenshots/full-batch-review.png',fullPage:false});await page.getByRole('button',{name:'Apply update · 200 changed',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.all-loads .load-card')).toHaveCount(12);await expect(page.locator('.load-full-batch tbody tr')).toHaveCount(200);await expect(page.locator('.load-full-batch .sheet-tag.pool')).toHaveCount(128);
  await page.screenshot({path:'.local/screenshots/load-build-carriers.png',fullPage:false});
  await page.getByRole('button',{name:'Paste carrier sheet',exact:true}).click();await page.getByLabel('Paste carrier sheet').fill(sheet());await page.getByRole('button',{name:'Review changes'}).click();await expect(page.getByRole('button',{name:'Apply update · 0 changed',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Apply update · 0 changed',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Paste full batch for Valida'}).click();await page.getByLabel('Paste carrier sheet').fill(sheet(78,true));await page.getByRole('button',{name:'Review changes'}).click();await expect(page.getByRole('dialog').locator('.review-summary')).toContainText('1New load builds');await expect(page.getByRole('dialog').locator('.review-summary')).toContainText('122Not load built');await page.getByRole('button',{name:'Apply update · 12 changed',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const w=await (await page.request.get(`/api/projects/${p}/workspace`)).json();expect(w.units).toHaveLength(200);expect(w.loads).toHaveLength(13);expect(w.units.filter(u=>!u.load_id)).toHaveLength(122);expect(w.units.filter(u=>u.status==='delivered')).toHaveLength(6);expect(w.units.every(u=>u.notes==='Keep original note'&&u.packing_list==='Full source batch')).toBe(true);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
