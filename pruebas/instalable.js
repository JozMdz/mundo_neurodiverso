// Revisa que la app se pueda instalar (manifest, íconos, service worker) y qué pasa sin señal.
// Sirve la carpeta del repo por http://127.0.0.1, como la serviría GitHub Pages, con el Supabase falso.
// Uso: node pruebas/instalable.js "$PWD"
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const raiz = process.argv[2] || process.cwd();
const mock = fs.readFileSync(__dirname + '/mock-supabase.js', 'utf8');
const puerto = 8700 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${puerto}/`;
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fallas++; };
const espera = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const servidor = spawn('python3', ['-m', 'http.server', String(puerto), '--bind', '127.0.0.1', '--directory', raiz], { stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 40; i++) { try { await fetch(base); break; } catch { await espera(150); } }
    browser = await chromium.launch();
    const ctx = await browser.newContext({ serviceWorkers: 'allow' });
    await ctx.route('**/*', r => {
      const u = r.request().url();
      if (u.includes('supabase-js')) return r.fulfill({ contentType: 'application/javascript', body: mock });
      if (u.includes('supabase.co')) return r.abort();        // nunca a la base real
      return r.continue();
    });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(String(e)));

    console.log('Instalable');
    await page.goto(base + '?como=d1');
    ok(await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)), 'el service worker se registra y se activa');
    await page.reload();
    ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'el service worker controla la página al recargar');
    ok(await page.evaluate(() => !!window.__DB), 'la prueba usa el Supabase falso');
    const cdp = await ctx.newCDPSession(page);
    const man = await cdp.send('Page.getAppManifest');
    ok(man.errors.length === 0, 'el manifest no tiene errores ' + man.errors.map(e => e.message).join(' | '));
    const datos = JSON.parse(man.data || '{}');
    ok(datos.display === 'standalone' && datos.short_name === 'Consultorio', 'abre como app (sin barras del navegador) con el nombre "Consultorio"');
    const inst = await cdp.send('Page.getInstallabilityErrors');
    ok(inst.installabilityErrors.length === 0, 'Chrome la considera instalable ' + inst.installabilityErrors.map(e => e.errorId).join(' | '));
    for (const ic of datos.icons || []) {
      const [w] = ic.sizes.split('x').map(Number);
      const real = await page.evaluate(src => new Promise(res => { const im = new Image(); im.onload = () => res(im.naturalWidth); im.onerror = () => res(0); im.src = src; }), ic.src);
      ok(real === w, `ícono ${ic.src} (${ic.purpose}) mide ${w}px`);
    }
    const apple = await page.evaluate(() => new Promise(res => { const im = new Image(); im.onload = () => res(im.naturalWidth); im.onerror = () => res(0); im.src = document.querySelector('link[rel=apple-touch-icon]').href; }));
    ok(apple === 180, 'ícono para iPhone (apple-touch-icon) de 180px');
    ok(await page.evaluate(() => document.querySelector('meta[name=apple-mobile-web-app-title]').content) === 'Consultorio', 'nombre bajo el ícono en iPhone: "Consultorio"');
    const guardado = await page.evaluate(() => caches.keys().then(ks => Promise.all(ks.map(k => caches.open(k).then(c => c.keys())))).then(l => l.flat().map(r => r.url)));
    ok(guardado.length > 0 && guardado.every(u => u.startsWith(base)), `solo se guardan archivos del sitio, nada de Supabase (${guardado.length})`);
    ok(errores.length === 0, 'sin errores en consola ' + errores.join(' | '));

    console.log('Sin señal');
    await ctx.unroute('**/*');
    await ctx.setOffline(true);
    await page.reload().catch(() => {});
    await espera(500);
    ok(await page.evaluate(() => document.title.startsWith('Mundo Neurodiverso')), 'la app abre desde la copia guardada');
    ok(await page.evaluate(() => !!document.querySelector('.sin-red') && !document.querySelector('#loginEmail')), 'muestra "Sin conexión" con botón Reintentar en vez de un login que no responde');
    await page.screenshot({ path: require('os').tmpdir() + '/consultorio-sin-red.png' });
    await ctx.setOffline(false);
  } finally {
    if (browser) await browser.close();
    servidor.kill();
  }
  console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})();
