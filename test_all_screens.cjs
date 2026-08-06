const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('pageerror', err => {
     console.log('PAGE ERROR:', err.stack || err.message);
  });
  
  page.on('console', msg => {
     if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
  });

  page.on('requestfailed', request => {
     console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText || '');
  });

  page.on('response', response => {
     if (response.status() >= 400) {
        console.log(`RESPONSE ERROR [${response.status()}]:`, response.url());
     }
  });

  console.log('Navigating to http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));
  
  // Get all navigation buttons
  const buttons = await page.$$('nav button');
  console.log(`Found ${buttons.length} nav buttons.`);
  
  for (let i = 0; i < buttons.length; i++) {
    console.log(`Clicking nav button ${i}...`);
    try {
      await buttons[i].click();
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.log(`Failed to click button ${i}:`, e.message);
    }
  }

  // Also check if onboarding is showing, etc.
  console.log('Testing completed.');
  await browser.close();
})();
