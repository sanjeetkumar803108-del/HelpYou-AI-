const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 812 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  // bypass onboarding
  await page.evaluate(() => {
    localStorage.setItem('hasCompletedOnboarding', 'true');
  });
  await page.reload({ waitUntil: 'networkidle0' });
  
  const tabs = await page.$$('nav button');
  if (tabs.length > 3) {
    await tabs[3].click();
    await new Promise(r => setTimeout(r, 2000));
  }
  
  await page.screenshot({ path: 'screenshot_pocket_teacher.png' });
  console.log("Screenshot saved.");
  
  await browser.close();
})();
