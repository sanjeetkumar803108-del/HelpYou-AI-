const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  await page.evaluate(() => { localStorage.setItem('hasCompletedOnboarding', 'true'); });
  await page.reload({ waitUntil: 'networkidle0' });
  
  const tabs = await page.$$('nav button');
  if (tabs.length > 2) await tabs[2].click();
  await new Promise(r => setTimeout(r, 2000));
  
  const isCovered = await page.evaluate(() => {
    const btn = document.querySelector('button.bg-purple-600');
    if (!btn) return "No button";
    const rect = btn.getBoundingClientRect();
    const elAtPoint = document.elementFromPoint(rect.x + rect.width/2, rect.y + rect.height/2);
    return {
      btnRect: {x: rect.x, y: rect.y, w: rect.width, h: rect.height},
      elAtPoint: elAtPoint ? elAtPoint.tagName + ' ' + elAtPoint.className : 'null',
      disabled: btn.disabled
    };
  });
  console.log(isCovered);
  
  await browser.close();
})();
