const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  // Click on AITutor tab
  const tabs = await page.$$('nav button');
  if (tabs.length > 2) {
    await tabs[2].click();
    await new Promise(r => setTimeout(r, 2000));
  }
  
  const dom = await page.evaluate(() => {
    const input = document.querySelector('input[type="text"]');
    if (!input) return "No input found";
    const parent = input.closest('div.bg-zinc-50');
    
    const getRect = (el) => {
      const rect = el.getBoundingClientRect();
      return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
    };
    
    return {
       inputBounds: getRect(input),
       parentBounds: parent ? getRect(parent) : null,
       navBounds: getRect(document.querySelector('nav')),
       windowHeight: window.innerHeight
    };
  });
  console.log(JSON.stringify(dom, null, 2));
  
  await browser.close();
})();
