const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('pageerror', err => {
     console.log('PAGE ERROR:', err.stack || err.message);
  });
  
  page.on('console', msg => {
     console.log(`CONSOLE [${msg.type()}]:`, msg.text());
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 4000)); // wait extra for splash screen (2.5s)
  
  const content = await page.content();
  console.log('--- RENDERED HTML ---');
  console.log(content.substring(0, 1500));
  console.log('---------------------');
  
  await browser.close();
})();
