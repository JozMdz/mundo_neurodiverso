// Recorre los flujos del expediente en tamaño iPhone 11 con el Supabase falso.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const FILE = process.argv[2];
const mock = fs.readFileSync(__dirname + '/mock-supabase.js', 'utf8');
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fallas++; };

async function abrir(browser, como, disp) {
  const ctx = await browser.newContext({ ...(disp || devices['iPhone 11']), locale: 'es-MX', timezoneId: 'America/Mexico_City' });
  const page = await ctx.newPage();
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.includes('supabase-js')) return r.fulfill({ contentType: 'application/javascript', body: mock });
    if (u.includes('supabase.co')) return r.abort();
    return r.continue();
  });
  page.errores = [];
  page.on('pageerror', e => page.errores.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') page.errores.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto('file://' + FILE + '?como=' + como);
  await page.waitForTimeout(700);
  return page;
}
const visible = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'; }, sel);
const ancho = page => page.evaluate(() => document.documentElement.scrollWidth);

(async () => {
  const browser = await chromium.launch();

  console.log('Dirección en iPhone 11');
  let page = await abrir(browser, 'd1');
  await page.tap('nav.tabs button[data-vista=expediente]');
  ok(await visible(page, '.px-col-lista') && !(await visible(page, '.px-col-detalle')), 'al entrar se ve solo la lista');
  await page.evaluate(() => window.scrollTo(0, 500)); await page.waitForTimeout(100);
  const antes = await page.evaluate(() => history.length);
  await page.tap('#listaPx .px-lista:last-child .px-fila >> nth=2');
  await page.waitForTimeout(250);
  ok(await visible(page, '.px-col-detalle') && !(await visible(page, '.px-col-lista')), 'al tocar un paciente se abre su expediente');
  ok(await page.evaluate(() => Math.abs(document.querySelector('.px-barra').getBoundingClientRect().top) < 2), 'la barra "‹ Pacientes" queda arriba de la pantalla');
  ok(await page.evaluate(() => history.length) === antes + 1, 'se agrega un paso al historial (gesto de regresar)');
  await page.goBack(); await page.waitForTimeout(250);
  ok(await visible(page, '.px-col-lista') && !(await visible(page, '.px-col-detalle')), 'el gesto de regresar vuelve a la lista');
  ok(Math.abs(await page.evaluate(() => scrollY) - 500) < 5, 'la lista regresa a donde estaba');
  await page.tap('#listaPx .px-lista:last-child .px-fila >> nth=0'); await page.waitForTimeout(200);
  await page.tap('nav.tabs button[data-vista=expediente]'); await page.waitForTimeout(250);
  ok(!(await visible(page, '.px-col-detalle')), 'tocar otra vez la pestaña Expediente regresa a la lista');
  await page.tap('.px-filtros button:nth-child(2)'); await page.waitForTimeout(150);
  const conAviso = await page.$$eval('#listaPx .px-fila', f => f.length);
  ok(conAviso > 0 && await page.$$eval('#listaPx .px-fila', f => f.every(x => x.querySelector('.px-badge'))), `filtro "Por revisar" muestra solo pacientes con avisos (${conAviso})`);
  await page.tap('#listaPx .px-fila >> nth=0'); await page.waitForTimeout(200);
  const nombre = await page.textContent('.px-barra b');
  await page.tap('.nota .rev-btn'); await page.waitForTimeout(300);
  ok(await visible(page, '.px-col-detalle') && (await page.textContent('.px-barra b')) === nombre, 'al marcar revisada el expediente sigue abierto');
  // comentario
  await page.tap('.nota .com-toggle >> nth=0'); await page.waitForTimeout(150);
  await page.fill('.com-add input', 'Prueba de comentario <b>sin html</b>');
  await page.evaluate(() => render()); await page.waitForTimeout(100);
  ok((await page.inputValue('.com-add input')) === 'Prueba de comentario <b>sin html</b>', 'lo escrito no se pierde si la pantalla se redibuja');
  await page.tap('.com-add .btn'); await page.waitForTimeout(300);
  ok((await page.inputValue('.com-add input')) === '', 'al enviar, el campo de comentario se limpia');
  ok(await page.evaluate(() => [...document.querySelectorAll('.com-txt')].some(e => e.textContent === 'Prueba de comentario <b>sin html</b>')), 'el comentario aparece como texto (no como HTML)');
  // editar y borrar desde ⋯
  await page.tap('.nota .nota-mas >> nth=0'); await page.waitForTimeout(300);
  ok(await visible(page, '#modalAcciones.abierto'), 'el botón ⋯ abre la hoja de opciones');
  await page.tap('#accBotones .acc-btn >> nth=0'); await page.waitForTimeout(200);
  await page.fill('.nota-edit textarea', 'Nota editada\ncon dos renglones');
  await page.tap('.nota-edit .btn >> nth=0'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('.nota-texto').innerText.includes('con dos renglones')), 'editar nota guarda el texto');
  const notasAntes = await page.$$eval('.nota', n => n.length);
  await page.tap('.nota .nota-mas >> nth=0'); await page.waitForTimeout(300);
  await page.tap('#accBotones .acc-btn.peligro'); await page.waitForTimeout(300);
  ok(await page.$$eval('.nota', n => n.length) === notasAntes - 1, 'eliminar nota (con confirmación) la quita');
  // nueva nota
  await page.tap('.px-notas-cab .btn'); await page.waitForTimeout(300);
  ok((await page.textContent('#nPara')).includes(nombre), 'la hoja de nueva nota dice para qué paciente es');
  await page.fill('#nTexto', 'Nota nueva desde el celular');
  await page.tap('#modalNota .pie .btn:not(.fantasma)'); await page.waitForTimeout(300);
  ok((await page.textContent('.nota .nota-texto')) === 'Nota nueva desde el celular', 'la nota nueva aparece hasta arriba');
  await page.tap('.px-notas-cab .btn'); await page.waitForTimeout(300);
  await page.fill('#nTexto', 'Nota a medio escribir');
  await page.goBack(); await page.waitForTimeout(250);
  ok(await visible(page, '#modalNota.abierto') && await visible(page, '.px-col-detalle') && (await page.inputValue('#nTexto')) === 'Nota a medio escribir',
    'el gesto de regresar no cierra una nota a medio escribir');
  await page.evaluate(() => cerrar('modalNota'));
  // archivar
  await page.tap('.px-acciones .btn >> nth=1'); await page.waitForTimeout(300);
  ok(await visible(page, '.px-col-detalle') && (await page.textContent('.px-ficha-top h3')).includes('archivado'), 'al archivar se queda en el expediente con "Reactivar"');
  await page.goBack(); await page.waitForTimeout(250);
  ok(await page.$$eval('.px-filtros button', b => b.some(x => x.textContent.startsWith('Archivados'))), 'aparece el filtro "Archivados"');
  // búsqueda sin acentos
  await page.tap('.px-filtros button >> nth=0');
  await page.fill('#buscaPx', 'sanchez'); await page.waitForTimeout(150);
  ok(await page.$$eval('#listaPx .px-fila b', b => b.map(x => x.textContent).join('|')) === 'Diego Sánchez Mora', 'buscar "sanchez" encuentra "Sánchez"');
  await page.fill('#buscaPx', '');
  for (const v of ['agenda', 'expediente', 'cobros', 'facturas', 'equipo']) {
    await page.tap(`nav.tabs button[data-vista=${v}]`); await page.waitForTimeout(150);
    ok(await ancho(page) <= 414, `sin scroll horizontal en ${v}`);
  }
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  console.log('Psicóloga en iPhone 11');
  page = await abrir(browser, 's1');
  await page.tap('nav.tabs button[data-vista=expediente]');
  const badge = Number(await page.textContent('#badgeExp'));
  await page.tap('.px-filtros button:nth-child(2)'); await page.waitForTimeout(150);
  await page.tap('#listaPx .px-fila >> nth=0'); await page.waitForTimeout(200);
  ok(await visible(page, '.nota.nueva'), 'la nota con mensaje nuevo se resalta');
  await page.tap('.nota.nueva .com-toggle'); await page.waitForTimeout(300);
  ok(Number(await page.textContent('#badgeExp') || 0) === badge - 1, 'abrir los comentarios la marca como leída');
  ok(!(await page.$('.px-acciones')), 'la psicóloga no ve Editar/Archivar');
  ok(await ancho(page) <= 414, 'sin scroll horizontal en el expediente');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  console.log('Dirección en computadora');
  page = await abrir(browser, 'd1', { viewport: { width: 1280, height: 800 } });
  await page.click('nav.tabs button[data-vista=expediente]');
  ok(await visible(page, '.px-col-lista') && await visible(page, '.px-col-detalle'), 'lista y expediente lado a lado');
  ok(!(await visible(page, '.px-barra')), 'sin barra "‹ Pacientes" en computadora');
  const h = await page.evaluate(() => history.length);
  await page.click('#listaPx .px-lista:last-child .px-fila >> nth=3'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => history.length) === h, 'elegir paciente no agrega pasos al historial');
  await page.screenshot({ path: require('os').tmpdir() + '/expediente-escritorio.png' });
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  await browser.close();
  console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})();
