const puppeteer = require('puppeteer');

(async () => {
    console.log("Starting Puppeteer test...");
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    await page.goto('http://localhost:3000');
    await page.waitForSelector('.month-label');

    let label = await page.$eval('.month-label', el => el.innerText);
    console.log("Initial Month Label:", label);

    // Click Next Month
    const nextBtn = await page.$$('button');
    await nextBtn[1].click(); // Second button is nextMonth

    await new Promise(r => setTimeout(r, 500));

    label = await page.$eval('.month-label', el => el.innerText);
    console.log("After Next Click:", label);

    // Click Prev Month
    await nextBtn[0].click(); // First button is prevMonth
    await new Promise(r => setTimeout(r, 500));

    label = await page.$eval('.month-label', el => el.innerText);
    console.log("After Prev Click:", label);

    await browser.close();
})();
