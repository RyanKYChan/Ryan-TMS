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
