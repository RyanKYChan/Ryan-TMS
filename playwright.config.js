import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/browser',timeout:30000,workers:1,
  use:{baseURL:'http://127.0.0.1:3100',headless:true,timezoneId:'Europe/Amsterdam',viewport:{width:1440,height:1100},launchOptions:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}},
  webServer:{command:'TMS_DB_PATH=.local/e2e.sqlite PORT=3100 npm run dev',url:'http://127.0.0.1:3100/api/health',reuseExistingServer:false,timeout:30000},
  reporter:'list',
});
