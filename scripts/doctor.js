const { chromium } = require('playwright');
const { getConfig } = require('../src/server');

async function main() {
  const cfg = getConfig();
  console.log('PACS connector doctor');
  console.log(`- Base URL: ${cfg.baseUrl}`);
  console.log(`- Web URL: ${cfg.webUrl}`);
  console.log(`- QIDO root: ${cfg.dicomweb.qidoRoot}`);
  console.log(`- Proxy configured: ${cfg.proxy.configured ? 'yes' : 'no'}`);
  console.log(`- API key required: ${process.env.CONNECTOR_API_KEY ? 'yes' : 'no'}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent('<html><body><h1>playwright ok</h1></body></html>');
  const title = await page.locator('h1').textContent();
  await browser.close();
  console.log(`- Browser check: ${title}`);

  console.log('doctor ok');
}

main().catch((error) => {
  console.error('doctor failed:', error.message);
  process.exit(1);
});
