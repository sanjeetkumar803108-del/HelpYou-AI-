const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  const tabs = await page.$$('nav button');
  if (tabs.length > 2) {
    await tabs[2].click();
    await new Promise(r => setTimeout(r, 2000));
  }
  
  const dom = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('nav button'));
    return tabs.map(t => ({ text: t.textContent, className: t.className }));
  });
  console.log(dom);
  
  await browser.close();
})();
