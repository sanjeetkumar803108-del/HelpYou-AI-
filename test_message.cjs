const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 667 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  // bypass onboarding
  await page.evaluate(() => {
    localStorage.setItem('hasCompletedOnboarding', 'true');
  });
  await page.reload({ waitUntil: 'networkidle0' });
  
  const tabs = await page.$$('nav button');
  if (tabs.length > 2) {
    await tabs[2].click();
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Send a message
  await page.type('input[type="text"]', 'Hello');
  
  // Click the send button (bg-purple-600)
  await page.click('button.bg-purple-600');
  
  await new Promise(r => setTimeout(r, 1000));
  
  await page.screenshot({ path: 'screenshot_tutor_after_send.png' });
  console.log("Screenshot saved.");
  
  await browser.close();
})();
