// Captura la app en tamaño iPhone 11 (computadora con ESCRITORIO=1, Android con DISPOSITIVO='Pixel 5') usando el Supabase falso.
// Uso: node captura.js <ruta absoluta a index.html> <prefijo de salida> <d1|s1> [pasos...]
// Pasos: js=<código>  click=<selector>  wait=<ms>  scroll=<y>  shot=<nombre>  full=<nombre>
const { chromium, devices } = require('playwright');
const fs = require('fs');
const [,, file, out, como='d1', ...pasos] = process.argv;
(async () => {
  const browser = await chromium.launch();
  // DISPOSITIVO='Pixel 5' (u otro de Playwright) para revisar en Android
  const disp = process.env.ESCRITORIO ? { viewport:{ width:1280, height:800 } } : devices[process.env.DISPOSITIVO || 'iPhone 11'];
  const ctx = await browser.newContext({ ...disp, locale:'es-MX', timezoneId:'America/Mexico_City' });
  const page = await ctx.newPage();
  const mock = fs.readFileSync(__dirname + '/mock-supabase.js', 'utf8');
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.includes('supabase-js')) return r.fulfill({ contentType: 'application/javascript', body: mock });
    if (u.includes('/functions/v1/avisar')) return r.fulfill({ contentType: 'application/json', body: '{"publica":null}' });   // función de avisos sin instalar
    if (u.includes('supabase.co')) return r.abort();            // nunca a la base real
    return r.continue();
  });
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await page.goto('file://' + file + '?como=' + como);
  await page.waitForTimeout(800);
  let n = 0;
  for (const p of pasos) {
    const i = p.indexOf('='); const acc = p.slice(0, i), arg = p.slice(i + 1);
    if (acc === 'js') await page.evaluate(arg);
    else if (acc === 'click') await page.click(arg);
    else if (acc === 'wait') await page.waitForTimeout(+arg);
    else if (acc === 'scroll') await page.evaluate(y => window.scrollTo(0, +y), arg);
    else if (acc === 'shot') { await page.waitForTimeout(350); await page.screenshot({ path: `${out}-${arg}.png` }); n++; }
    else if (acc === 'full') { await page.waitForTimeout(350); await page.screenshot({ path: `${out}-${arg}.png`, fullPage: true }); n++; }
  }
  const ancho = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vp: innerWidth, alto: document.documentElement.scrollHeight }));
  console.log(JSON.stringify({ capturas: n, ancho, errores }));
  await browser.close();
})();
