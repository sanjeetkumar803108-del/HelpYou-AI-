const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('pageerror', err => {
     console.log('Page Error:', err.message);
  });
  page.on('console', msg => {
     if (msg.type() === 'error') console.log('Console Error:', msg.text());
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  const tabs = await page.$$('nav button');
  if (tabs.length > 2) {
    await tabs[2].click();
    await new Promise(r => setTimeout(r, 1000));
  }
  
  await browser.close();
})();
