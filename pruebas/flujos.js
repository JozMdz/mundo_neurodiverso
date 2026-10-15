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
  // Texto con HTML (nombre, motivo, método de pago): se muestra como texto y no se ejecuta
  await page.evaluate(async () => {
    const trampa = '<img src=x onerror="window.__xss=1">';
    __DB.pacientes.forEach(p => { p.nombre += ' ' + trampa; p.motivo = trampa; p.tutor = trampa; });
    __DB.psicologas.forEach(p => { p.nombre += ' ' + trampa; p.cedula = trampa; });
    __DB.pagos.forEach(g => { g.metodo = 'efectivo"><img src=x onerror="window.__xss=1">'; });
    await refrescar();
    for (const v of ['agenda', 'expediente', 'cobros', 'facturas', 'equipo']) { irA(v); await new Promise(r => setTimeout(r, 120)); }
    setVistaAgenda('dia'); seleccionarPx(__DB.pacientes[0].id);
    abrirCita('10:00'); cerrar('modalCita'); abrirPago(); cerrar('modalPago'); abrirFactura(); cerrar('modalFactura');
    await new Promise(r => setTimeout(r, 300));
  });
  ok(!(await page.evaluate(() => window.__xss)) && !(await page.$('img[src="x"]')), 'texto con HTML se muestra como texto en todas las pantallas y ventanas');
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

  console.log('Horario de la agenda');
  page = await abrir(browser, 'd1');
  ok(await page.evaluate(() => estado.vistaAgenda) === 'dia', 'en el celular la agenda empieza en el día (también Dirección)');
  const horas = () => page.evaluate(() => [...document.querySelectorAll('#agenda .etq')].map(e => e.textContent));
  // Un día de la próxima semana (sin citas de prueba): 0 = domingo … 6 = sábado
  const ir = (dow, vista = 'dia') => page.evaluate(([dow, vista]) => {
    const d = new Date(); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7) + 7);
    estado.fechaAgenda = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    setVistaAgenda(vista); return estado.fechaAgenda;
  }, [dow, vista]);
  const diaSem = () => page.evaluate(() => new Date(estado.fechaAgenda + 'T12:00:00').getDay());
  const miercoles = await ir(3);
  let h = await horas();
  ok(h[0] === '14:00' && h[h.length - 1] === '21:00', `entre semana muestra de 14:00 a 21:00 (${h[0]}–${h[h.length - 1]})`);
  ok(await page.evaluate(() => { const r = document.querySelector('#agenda .etq').getBoundingClientRect(), c = document.querySelector('#agenda .cal').getBoundingClientRect(); return r.top >= c.top; }), 'la primera hora se lee completa (no queda cortada arriba)');
  await page.click('#btnAgendar'); await page.waitForTimeout(250);
  ok((await page.inputValue('#cHora')) === '14:00', '"+ Agendar cita" propone las 14:00 entre semana');
  await page.evaluate(() => cerrar('modalCita'));
  await ir(6); h = await horas();
  ok(h[0] === '08:00' && h[h.length - 1] === '18:00', `el sábado muestra de 08:00 a 18:00 (${h[0]}–${h[h.length - 1]})`);
  await page.click('.barra-dia button.nav >> nth=1'); await page.waitForTimeout(150);
  ok(await diaSem() === 1, 'del sábado, "›" brinca el domingo y llega al lunes');
  await page.click('.barra-dia button.nav >> nth=0'); await page.waitForTimeout(150);
  ok(await diaSem() === 6, 'del lunes, "‹" regresa al sábado');
  await ir(0);
  ok(!!(await page.$('#agenda .agenda-cerrado')), 'el domingo sin citas dice "Sin horario de consulta"');
  // Citas fuera de horario: la agenda se amplía para mostrarlas
  await page.evaluate(async f => {
    __DB.citas.push({ id: 'fuera1', fecha: f, hora: '11:00:00', duracion: 60, psicologa_id: 's1', paciente_id: 'p1' });
    __DB.citas.push({ id: 'noche1', fecha: f, hora: '20:00:00', duracion: 60, psicologa_id: 's1', paciente_id: 'p2' });
    await refrescar();
  }, miercoles);
  await ir(3); h = await horas();
  ok(h[0] === '11:00' && h[h.length - 1] === '21:00', `una cita a las 11:00 amplía el día para mostrarla (${h[0]}–${h[h.length - 1]})`);
  ok(await page.evaluate(() => document.querySelectorAll('#agenda .fuera').length) === 1, 'las horas antes de las 14:00 se ven sombreadas');
  ok(await page.evaluate(() => { const c = document.querySelector('#agenda .cal').getBoundingClientRect();
    return [...document.querySelectorAll('#agenda .ev')].length === 2 && [...document.querySelectorAll('#agenda .ev')].every(e => e.getBoundingClientRect().bottom <= c.bottom); }), 'la cita de 8 a 9 pm se ve completa');
  ok(await page.evaluate(() => [...document.querySelectorAll('#agenda .mas')].every(m => { const t = m.title.slice(-5); return t >= '14:00' && t < '21:00'; })), 'el "+" para agendar solo aparece dentro del horario');
  await ir(3, 'semana'); h = await horas();
  ok(h[0] === '08:00' && h[h.length - 1] === '21:00', `la semana va de 08:00 a 21:00 para que quepa el sábado (${h[0]}–${h[h.length - 1]})`);
  ok(await page.evaluate(() => { const c = [...document.querySelectorAll('.sem-col')];
    return c.length === 6 && c.slice(0, 5).every(x => x.querySelector('.fuera[style^="top:0"]')) && !!c[5].querySelector('.fuera[style*="bottom:0"]'); }),
    'en la semana se sombrean las mañanas de lunes a viernes y la tarde del sábado');
  ok(await page.evaluate(() => document.querySelectorAll('.sem-col .mas').length) === 5 * 14 + 20, '"+" solo dentro del horario de cada día');
  ok(await ancho(page) <= 414, 'sin scroll horizontal en la agenda');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  console.log('Agendar por voz: lo que entiende (base: miércoles 14 de octubre de 2026)');
  const FRASES = [
    ['Cita con Valentina el jueves a las 5', { fechas: ['2026-10-15'], hora: '17:00' }],
    ['Agenda a Mateo Hernández mañana a las 4 con Andrea', { fechas: ['2026-10-15'], hora: '16:00' }],
    ['Regina el sábado a las 10 de la mañana, de hora y media', { fechas: ['2026-10-17'], hora: '10:00', dur: 90 }],
    ['Mateo el 20 de octubre a las 7 de la noche', { fechas: ['2026-10-20'], hora: '19:00' }],
    ['Valentina todos los martes y jueves a las 6 por un mes', { fechas: [], dias: [2, 4], hora: '18:00', semanas: 4 }],
    ['Diego el próximo miércoles a las 3 y media', { fechas: ['2026-10-21'], hora: '15:30' }],
    ['Camila pasado mañana a las cinco', { fechas: ['2026-10-16'], hora: '17:00' }],
    ['Sebastián en 3 días a la una', { fechas: ['2026-10-17'], hora: '13:00' }],
    ['Leonardo el sábado a las 8', { fechas: ['2026-10-17'], hora: '08:00' }],
    ['Emiliano el viernes a las 8', { fechas: ['2026-10-16'], hora: '20:00' }],
    ['Ximena hoy a las 7, de 45 minutos', { fechas: ['2026-10-14'], hora: '19:00', dur: 45 }],
    ['Natalia el lunes a las 5 p. m.', { fechas: ['2026-10-19'], hora: '17:00' }],
    ['Valentina a las 6', { fechas: [], hora: '18:00' }],
    ['Regina el viernes en la mañana', { fechas: ['2026-10-16'], hora: null }],
    ['Mateo el 3 a las 4', { fechas: ['2026-11-03'], hora: '16:00' }],
    ['Cada sábado a las 9 durante 8 semanas', { fechas: [], dias: [6], hora: '09:00', semanas: 8 }],
  ];
  for (const [frase, esperado] of FRASES) {
    const r = await page.evaluate(f => entenderCita(f, '2026-10-14'), frase);
    const bien = Object.entries(esperado).every(([k, v]) => JSON.stringify(r[k]) === JSON.stringify(v));
    ok(bien, `«${frase}» → ${r.fechas.join(',') || (r.dias.length ? 'días ' + r.dias : 'sin fecha')} ${r.hora || 'sin hora'}${r.dur ? ' ' + r.dur + ' min' : ''}${r.semanas ? ' ×' + r.semanas + ' sem' : ''}`);
  }

  console.log('Agendar por voz: de la frase a la hoja');
  page = await abrir(browser, 'd1');
  await page.evaluate(() => {
    window.__frase = '';
    window.SpeechRecognition = window.webkitSpeechRecognition = class {   // micrófono simulado: "dicta" window.__frase
      start() { setTimeout(() => { this.onresult({ results: [[{ transcript: window.__frase }]] }); setTimeout(() => this.onend(), 30); }, 30); }
      abort() {} stop() {}
    };
    renderAgenda();
  });
  ok(await visible(page, '#btnVoz'), 'Dirección ve el micrófono junto a "+ Agendar cita"');
  const dictar = async frase => { await page.evaluate(f => { window.__frase = f; }, frase); await page.click('#btnVoz'); await page.waitForTimeout(350); };
  const hoja = () => page.evaluate(() => ({ abierta: document.getElementById('modalCita').classList.contains('abierto'),
    pac: document.getElementById('cPaciente').value, psic: document.getElementById('cPsic').value, hora: document.getElementById('cHora').value,
    dia: new Date(estado.fechaAgenda + 'T12:00:00').getDay(), dur: document.getElementById('cDur').value,
    chips: [...document.querySelectorAll('#cDias .dia-chip.on')].map(b => b.textContent), semanas: document.getElementById('cSemanas').value,
    voz: document.getElementById('cVoz').textContent }));
  await dictar('Cita con Valentina el jueves a las 5');
  let hj = await hoja();
  ok(hj.abierta && hj.pac === 'p2' && hj.psic === 's1' && hj.hora === '17:00' && hj.dia === 4,
    'se abre la hoja con Valentina, su psicóloga, el jueves a las 17:00');
  ok(hj.voz.includes('Valentina el jueves a las 5'), 'la hoja muestra lo que se escuchó');
  const antesCitas = await page.evaluate(() => __DB.citas.length);
  await page.click('#cGuardar'); await page.waitForTimeout(300);
  ok(await page.evaluate(n => __DB.citas.length === n + 1 && __DB.citas.at(-1).paciente_id === 'p2', antesCitas), 'al confirmar se agenda la cita');
  await dictar('Mateo Hernández mañana a las 4 con Andrea');
  hj = await hoja();
  ok(hj.pac === 'p1' && hj.psic === 's2' && hj.hora === '16:00', 'si dices "con Andrea", la cita queda con Andrea');
  await page.evaluate(() => cerrar('modalCita'));
  await dictar('Valentina todos los martes y jueves a las 6 por un mes');
  hj = await hoja();
  ok(hj.chips.join() === 'Mar,Jue' && hj.semanas === '4' && hj.hora === '18:00', 'repetición: martes y jueves a las 18:00 durante 4 semanas');
  const n0 = await page.evaluate(() => __DB.citas.length);
  await page.click('#cGuardar'); await page.waitForTimeout(300);
  ok(await page.evaluate(n => { const nuevas = __DB.citas.slice(n);
    return nuevas.length >= 5 && nuevas.every(c => c.paciente_id === 'p2' && c.hora.startsWith('18:00') && [2, 4].includes(new Date(c.fecha + 'T12:00:00').getDay())); }, n0),
    'se agendan las citas de martes y jueves');
  await dictar('Cita con Pedro el jueves a las 5');
  hj = await hoja();
  ok(hj.pac === '' && hj.voz.includes('No reconocí al paciente'), 'si no reconoce al paciente, pide elegirlo');
  const n1 = await page.evaluate(() => __DB.citas.length);
  await page.click('#cGuardar'); await page.waitForTimeout(250);
  ok(await page.evaluate(n => __DB.citas.length === n, n1) && (await page.textContent('#toast')).includes('Elige el paciente'), 'sin paciente no se agenda nada');
  await page.evaluate(() => cerrar('modalCita'));
  await page.evaluate(() => { window.__frase = 'algo'; });
  await page.click('#btnVoz'); await page.click('#vozX'); await page.waitForTimeout(250);
  ok(!(await visible(page, '#voz.ver')) && !(await visible(page, '#modalCita.abierto')), '"Cancelar" cierra sin abrir la hoja');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));
  page = await abrir(browser, 's1');
  await page.evaluate(() => { window.SpeechRecognition = window.webkitSpeechRecognition = class {}; renderAgenda(); });
  ok(!(await visible(page, '#btnVoz')), 'las psicólogas no ven el micrófono (solo Dirección agenda)');

  console.log('Hoja de cita: psicóloga y pacientes que propone');
  page = await abrir(browser, 'd1');
  const propuesta = () => page.evaluate(() => { abrirCita('15:00'); const s = document.getElementById('cPsic');
    const g = [...document.querySelectorAll('#cPaciente optgroup')];
    const r = { psic: s.value, grupos: g.map(x => x.label), suyos: g[0] ? [...g[0].children].map(o => o.textContent) : [] };
    cerrar('modalCita'); return r; });
  // Como en la base real: Dirección atiende y tiene pacientes, pero no es la primera fila de psicologas
  await page.evaluate(async () => { __DB.pacientes.slice(0, 4).forEach(x => x.asignada_a = 'd1'); __DB.psicologas.push(__DB.psicologas.shift()); await refrescar(); });
  let pr = await propuesta();
  ok(pr.psic === 'd1' && pr.grupos[0] === 'Pacientes de Mtra. Laura Gómez', `propone a quien agenda y sus pacientes primero (${pr.grupos.join(' / ')})`);
  ok(pr.suyos.length === 4 && pr.suyos.join() === pr.suyos.slice().sort((a, b) => a.localeCompare(b, 'es')).join(), 'sus pacientes en orden alfabético');
  await page.evaluate(async () => { __DB.psicologas.find(x => x.id === 'd1').atiende = false; __DB.pacientes.forEach(x => { if (x.asignada_a === 'd1') x.asignada_a = 's2'; }); await refrescar(); });
  pr = await propuesta();
  ok(pr.psic === 's2', 'si quien agenda no atiende, propone a la psicóloga con más pacientes');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  console.log('Dirección en computadora');
  page = await abrir(browser, 'd1', { viewport: { width: 1280, height: 800 } });
  ok(await page.evaluate(() => estado.vistaAgenda) === 'semana', 'en computadora Dirección empieza en la semana');
  await page.click('nav.tabs button[data-vista=expediente]');
  ok(await visible(page, '.px-col-lista') && await visible(page, '.px-col-detalle'), 'lista y expediente lado a lado');
  ok(!(await visible(page, '.px-barra')), 'sin barra "‹ Pacientes" en computadora');
  const pasos = await page.evaluate(() => history.length);
  await page.click('#listaPx .px-lista:last-child .px-fila >> nth=3'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => history.length) === pasos, 'elegir paciente no agrega pasos al historial');
  await page.screenshot({ path: require('os').tmpdir() + '/expediente-escritorio.png' });
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  await browser.close();
  console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})();
