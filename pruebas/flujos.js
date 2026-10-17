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
    if (u.includes('/functions/v1/avisar')) return r.fulfill({ contentType: 'application/json', body: '{"publica":null}' });   // función de avisos sin instalar
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
  await page.evaluate(() => { estado.pacientes.forEach(p => gruposPx.add(p.asignada || '')); renderExpediente(); });
  // Baja hasta que el paciente que se va a tocar quede a media pantalla (con los grupos abiertos la lista es larga)
  const yLista = await page.evaluate(() => { const e = document.querySelectorAll('#listaPx .px-lista:last-child .px-fila')[2]; saltarA(e.getBoundingClientRect().top + scrollY - 300); return scrollY; });
  await page.waitForTimeout(100);
  const antes = await page.evaluate(() => history.length);
  await page.tap('#listaPx .px-lista:last-child .px-fila >> nth=2');
  await page.waitForTimeout(250);
  ok(await visible(page, '.px-col-detalle') && !(await visible(page, '.px-col-lista')), 'al tocar un paciente se abre su expediente');
  ok(await page.evaluate(() => Math.abs(document.querySelector('.px-barra').getBoundingClientRect().top) < 2), 'la barra "‹ Pacientes" queda arriba de la pantalla');
  ok(await page.evaluate(() => history.length) === antes + 1, 'se agrega un paso al historial (gesto de regresar)');
  await page.goBack(); await page.waitForTimeout(250);
  ok(await visible(page, '.px-col-lista') && !(await visible(page, '.px-col-detalle')), 'el gesto de regresar vuelve a la lista');
  const yVuelta = await page.evaluate(() => scrollY);
  ok(yLista > 0 && Math.abs(yVuelta - yLista) < 5, `la lista regresa a donde estaba (${yLista} → ${yVuelta})`);
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
  ok(await page.$$eval('#nApartados textarea', a => a.length) === 4, 'la nota trae los 4 apartados');
  await page.fill('#nTexto', 'Nota nueva desde el celular'); await page.fill('#nPlan', 'Seguir con <b>rutinas</b>');
  await page.tap('#modalNota .pie .btn:not(.fantasma)'); await page.waitForTimeout(300);
  ok((await page.textContent('.nota .nota-texto')) === 'Qué se trabajó\nNota nueva desde el celular\n\nPlan para la próxima sesión\nSeguir con <b>rutinas</b>'
    && await page.$$eval('.nota:first-of-type .nota-ap', b => b.map(x => x.textContent).join()) === 'Qué se trabajó,Plan para la próxima sesión',
    'la nota nueva aparece hasta arriba, con sus apartados resaltados y solo los que se llenaron');
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
    menuCita(__DB.citas[0].id); cerrar('modalAcciones'); verPorConfirmar(); cerrar('modalAcciones'); reagendarCita(__DB.citas[0].id); cerrar('modalCita');
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
  // En el celular la semana es una lista por día
  await ir(3, 'semana');
  const semCel = await page.evaluate(() => ({ dias: [...document.querySelectorAll('.sem-dia')].map(d => d.querySelector('.sem-dia-ir b').textContent),
    filas: document.querySelectorAll('.sem-fila').length, cuadricula: !!document.querySelector('.sem-col') }));
  ok(!semCel.cuadricula && semCel.dias.length === 6 && semCel.dias[0].startsWith('Lun') && semCel.dias[5].startsWith('Sáb') && semCel.filas === 2,
    `en el celular la semana es una lista de lunes a sábado con sus citas (${semCel.dias.join(', ')} · ${semCel.filas} citas)`);
  ok(await page.evaluate(() => [...document.querySelectorAll('.sem-fila b')].every(b => b.scrollWidth <= b.clientWidth + 1 || getComputedStyle(b).textOverflow === 'ellipsis'))
    && await ancho(page) <= 414, 'los nombres caben en su renglón y no hay scroll horizontal');
  await page.tap('.sem-dia[data-dia="' + miercoles + '"] .sem-dia-ir'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => estado.vistaAgenda) === 'dia' && await page.evaluate(() => estado.fechaAgenda) === miercoles, 'al tocar un día se abre ese día');
  await ir(3, 'semana');
  await page.tap('.sem-fila[data-cita="noche1"]'); await page.waitForTimeout(200);
  ok(await visible(page, '#modalAcciones.abierto'), 'al tocar una cita se abren sus opciones');
  await page.evaluate(() => cerrar('modalAcciones'));
  await page.tap('.sem-dia[data-dia="' + miercoles + '"] .sem-dia-mas'); await page.waitForTimeout(200);
  ok(await visible(page, '#modalCita.abierto') && await page.inputValue('#cFechaIn') === miercoles && await page.inputValue('#cHora') === '14:00', '"+" de un día agenda en ese día a la hora de apertura');
  await page.evaluate(() => cerrar('modalCita'));
  // La cuadrícula de la semana, en computadora
  await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(200);
  await ir(3, 'semana'); h = await horas();
  ok(h[0] === '08:00' && h[h.length - 1] === '21:00', `la semana va de 08:00 a 21:00 para que quepa el sábado (${h[0]}–${h[h.length - 1]})`);
  ok(await page.evaluate(() => { const c = [...document.querySelectorAll('.sem-col')];
    return c.length === 6 && c.slice(0, 5).every(x => x.querySelector('.fuera[style^="top:0"]')) && !!c[5].querySelector('.fuera[style*="bottom:0"]'); }),
    'en la semana se sombrean las mañanas de lunes a viernes y la tarde del sábado');
  ok(await page.evaluate(() => document.querySelectorAll('.sem-col .mas').length) === 5 * 14 + 20, '"+" solo dentro del horario de cada día');
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

  console.log('Hoja de cita: al cambiar de psicóloga');
  page = await abrir(browser, 'd1');
  const hojaCita = () => page.evaluate(() => { const s = document.getElementById('cPaciente'), o = s.selectedOptions[0];
    return { psic: document.getElementById('cPsic').value, pac: s.value, grupo: o && o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : '' }; });
  await page.evaluate(() => abrirCita('15:00'));   // en los datos de prueba, Dirección atiende pero no tiene pacientes
  let hc = await hojaCita();
  ok(hc.psic === 'd1' && hc.pac === '', 'si la psicóloga no tiene pacientes, pide elegir en vez de poner uno cualquiera');
  await page.selectOption('#cPsic', 's2'); hc = await hojaCita();
  const primeroDe = id => page.evaluate(id => estado.pacientes.filter(p => p.asignada === id && p.activo !== false).map(p => p.id)
    .sort((a, b) => pac(a).nombre.localeCompare(pac(b).nombre, 'es'))[0], id);
  ok(hc.grupo === 'Pacientes de Andrea Torres' && hc.pac === await primeroDe('s2'), 'al cambiar a Andrea, la lista muestra sus pacientes y elige al primero');
  await page.selectOption('#cPsic', 's1'); hc = await hojaCita();
  ok(hc.grupo === 'Pacientes de Fernanda Ruiz' && hc.pac === await primeroDe('s1'), 'al cambiar otra vez, se mueve a los pacientes de Fernanda');
  await page.selectOption('#cPaciente', 'p5');   // Emiliano, paciente de Sofía: Fernanda va a cubrir
  await page.selectOption('#cPsic', 's2'); hc = await hojaCita();
  ok(hc.pac === 'p5' && hc.grupo === 'Otros pacientes (cubriendo)', 'si ya elegiste paciente (para cubrir), se respeta al cambiar de psicóloga');
  await page.evaluate(() => cerrar('modalCita'));
  const citaId = await page.evaluate(() => { const c = estado.citas.find(x => x.psic === 's1'); abrirEditarCita(c.id); return c.id; });
  const pacCita = await page.evaluate(id => estado.citas.find(x => x.id === id).pac, citaId);
  await page.selectOption('#cPsic', 's3'); hc = await hojaCita();
  ok(hc.pac === pacCita, 'al editar una cita, cambiar la psicóloga no cambia al paciente');
  await page.evaluate(() => { cerrar('modalCita'); citaDesdeVoz('Cita con Pedro el jueves a las 5'); });
  await page.selectOption('#cPsic', 's2'); hc = await hojaCita();
  ok(hc.pac === '', 'si la voz no reconoció al paciente, sigue pidiendo elegirlo aunque cambies de psicóloga');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  console.log('Asistencia de las citas: psicóloga');
  page = await abrir(browser, 's1');
  const cita = (id, n, hora, psic, pac, extra) => `__DB.citas.push(Object.assign({ id: '${id}', fecha: addDaysISO(hoyISO(), ${n}), hora: '${hora}:00', duracion: 60, psicologa_id: '${psic}', paciente_id: '${pac}', estado: 'programada', marcada_por: null, marcada_en: null, confirmada_por: null }, ${JSON.stringify(extra || {})}));`;
  await page.evaluate(`(async () => { ${cita('ayer1', -1, '15:00', 's1', 'p1')} ${cita('ayer2', -1, '17:00', 's1', 'p6')} ${cita('ayer3', -2, '16:00', 's1', 'p9')}
    ${cita('manana1', 1, '15:00', 's1', 'p2')} __DB.pagos = __DB.pagos.filter(g => g.paciente_id !== 'p9'); await refrescar(); })()`);
  const verDia = n => page.evaluate(n => { estado.fechaAgenda = addDaysISO(hoyISO(), n); setVistaAgenda('dia'); }, n);
  const botones = () => page.$$eval('#accBotones .acc-btn', b => b.map(x => x.textContent.trim()));
  const tocar = async txt => { await page.tap(`#accBotones .acc-btn >> text="${txt}"`); await page.waitForTimeout(300); };
  const fila = id => page.evaluate(id => ({ ...__DB.citas.find(c => c.id === id) }), id);
  await verDia(-1);
  await page.tap('.ev[data-cita="ayer1"]'); await page.waitForTimeout(250);
  let bs = await botones();
  ok(await visible(page, '#modalAcciones.abierto') && ['📝 Escribir nota', '✅ Asistió · registrar cobro', '🚫 No asistió'].every(x => bs.includes(x)), 'al tocar su cita de ayer: nota, cobro y "No asistió"');
  ok(!bs.some(x => /Editar|Cancelar cita|Reagendar|Eliminar/.test(x)), 'la psicóloga no ve editar, cancelar, reagendar ni eliminar');
  await tocar('🚫 No asistió');
  let fl = await fila('ayer1');
  ok(fl.estado === 'no_asistio' && fl.marcada_por === 's1' && !fl.confirmada_por, 'queda "no asistió" por confirmar, marcada por ella');
  ok(await page.$eval('.ev[data-cita="ayer1"]', e => e.classList.contains('no-asistio') && e.textContent.includes('por confirmar')), 'la agenda muestra "No asistió · por confirmar"');
  await page.tap('.ev[data-cita="ayer1"]'); await page.waitForTimeout(250);
  await tocar('↩︎ Sí asistió');
  ok((await fila('ayer1')).estado === 'programada', 'si se equivocó, "Sí asistió" la regresa');
  await page.tap('.ev[data-cita="ayer1"]'); await page.waitForTimeout(250); await tocar('🚫 No asistió');
  await page.tap('.ev[data-cita="ayer2"]'); await page.waitForTimeout(250); await tocar('✅ Asistió · registrar cobro');
  ok(await visible(page, '#modalPago.abierto') && await page.inputValue('#pPaciente') === 'p6' && await page.inputValue('#pMonto') === '700', '"Asistió · registrar cobro" abre el cobro con el paciente y su tarifa');
  await page.tap('#pGuardar'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => { const g = __DB.pagos.at(-1); return g.paciente_id === 'p6' && g.psicologa_id === 's1' && g.monto === 700 && g.cita_id === 'ayer2' && g.validado === false; }), 'el cobro queda ligado a esa cita y por validar');
  await page.tap('.ev[data-cita="ayer2"]'); await page.waitForTimeout(250);
  ok((await botones()).includes('💵 Cobro registrado ✓'), 'después dice "Cobro registrado ✓"');
  await tocar('📝 Escribir nota');
  ok(await visible(page, '#modalNota.abierto') && (await page.textContent('#nPara')).includes('Ximena'), '"Escribir nota" abre el expediente y la nota de ese paciente');
  await page.evaluate(() => cerrar('modalNota')); await page.tap('nav.tabs button[data-vista=agenda]');
  await verDia(1);
  await page.tap('.ev[data-cita="manana1"]'); await page.waitForTimeout(250);
  bs = await botones();
  ok(!bs.includes('🚫 No asistió') && bs.includes('👤 Ver expediente'), 'una cita que no ha llegado no se puede marcar');
  await page.evaluate(() => { cerrar('modalAcciones'); estado.cobrosPeriodo = { tipo: 'rango', desde: addDaysISO(hoyISO(), -7), hasta: hoyISO() }; });
  await page.tap('nav.tabs button[data-vista=cobros]'); await page.waitForTimeout(200);
  let corte = await page.textContent('#corte');
  ok(/sin cobro registrado/.test(corte) && corte.includes('Diego Sánchez Mora'), 'su corte avisa la sesión sin cobro (Diego)');
  ok(corte.includes('falta que Dirección lo confirme'), 'su corte avisa la inasistencia que falta confirmar');
  await page.tap('#corte .falta:has-text("Diego") .rev-btn'); await page.waitForTimeout(250);
  ok(await page.inputValue('#pPaciente') === 'p9', '"Registrar" desde el corte abre el cobro de ese paciente');
  await page.evaluate(() => cerrar('modalPago'));
  ok(await ancho(page) <= 414, 'sin scroll horizontal en su corte');
  const pend0 = await page.evaluate(async () => { __DB.citas.push({ id: 'hoy0', fecha: hoyISO(), hora: '00:00:00', duracion: 1, psicologa_id: 's1', paciente_id: 'p1', estado: 'programada' }); await refrescar(); return pendientesHoy().citas; });
  const pend1 = await page.evaluate(async () => { await sb.from('citas').update({ estado: 'no_asistio' }).eq('id', 'hoy0'); await refrescar(); return pendientesHoy().citas; });
  ok(pend1 === pend0 - 1, 'al salir, una cita en la que no asistió no pide nota ni cobro');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  console.log('Asistencia de las citas: Dirección');
  page = await abrir(browser, 'd1');
  await page.evaluate(`(async () => { ${cita('ayer4', -1, '15:00', 's2', 'p3')} ${cita('lejos1', 10, '15:00', 's1', 'p1')} ${cita('lejos2', 10, '16:00', 's2', 'p3')}
    ${cita('lejos3', 12, '16:00', 's2', 'p4')} ${cita('hoyNo', 0, '00:00', 's1', 'p1', { estado: 'no_asistio', confirmada_por: 'd1' })} __DB.pagos.forEach(g => g.validado = true); await refrescar(); })()`);
  ok((await page.textContent('#avisoAgenda')).includes('1 por validar') && await page.textContent('#badgeAg') === '1', 'Dirección ve cuántos hay por validar, también en la pestaña Agenda');
  await page.tap('#avisoAgenda button'); await page.waitForTimeout(250);
  ok(await page.$$eval('#accBotones .conf-fila', f => f.length) === 1, '"Validar" lista lo que falta validar');
  await page.tap('#accBotones .conf-fila .btn >> nth=0'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => __DB.citas.filter(c => c.estado === 'no_asistio' && !c.confirmada_por).length) === 0 && !(await visible(page, '#modalAcciones.abierto')), 'al confirmar la última, se cierra la lista');
  ok(await page.textContent('#avisoAgenda') === '' && await page.textContent('#badgeAg') === '', 'ya no hay aviso');
  await verDia(-1);
  await page.tap('.ev[data-cita="ayer4"]'); await page.waitForTimeout(250);
  bs = await botones();
  ok(['✎ Editar o cambiar de día', '🚫 No asistió', '✕ Cancelar cita'].every(x => bs.includes(x)), 'Dirección puede editar, marcar y cancelar');
  await tocar('🚫 No asistió');
  ok(!(await fila('ayer4')).confirmada_por && (await page.textContent('#avisoAgenda')).includes('1 por validar'), 'lo que marca Dirección también queda por validar');
  await page.evaluate(() => confirmarCita('ayer4')); await page.waitForTimeout(300);
  await page.tap('.ev[data-cita="ayer4"]'); await page.waitForTimeout(250);
  await tocar('📅 Reagendar en otro día');
  ok(await visible(page, '#modalCita.abierto') && await page.inputValue('#cPaciente') === 'p3' && await page.inputValue('#cPsic') === 's2'
    && await page.inputValue('#cFechaIn') === await page.evaluate(() => addDaysISO(hoyISO(), 6)), 'reagendar propone al mismo paciente una semana después');
  await page.evaluate(() => cerrar('modalCita'));
  await verDia(10);
  await page.tap('.ev[data-cita="lejos1"]'); await page.waitForTimeout(250);
  ok(!(await botones()).includes('🚫 No asistió'), 'en una cita futura no aparece "No asistió"');
  await tocar('✕ Cancelar cita');
  ok((await fila('lejos1')).estado === 'cancelada' && await page.$eval('.ev[data-cita="lejos1"]', e => e.classList.contains('cancelada')), 'cancelar la deja tachada en la agenda');
  const nc = await page.evaluate(() => __DB.citas.length);
  await page.evaluate(() => { abrirCita('15:00'); const s = document.getElementById('cPsic'); s.value = 's1'; renderPacientesCita(); document.getElementById('cPaciente').value = 'p2'; });
  await page.tap('#cGuardar'); await page.waitForTimeout(300);
  ok(await page.evaluate(n => __DB.citas.length === n + 1, nc), 'el horario de una cita cancelada queda libre para otra');
  await page.tap('.ev[data-cita="lejos2"]'); await page.waitForTimeout(250);
  await tocar('✎ Editar o cambiar de día');
  ok(await page.inputValue('#cFechaIn') === await page.evaluate(() => addDaysISO(hoyISO(), 10)), 'la hoja de editar trae el día de la cita');
  await page.fill('#cFechaIn', await page.evaluate(() => addDaysISO(hoyISO(), 12)));
  await page.tap('#cGuardar'); await page.waitForTimeout(300);
  ok(await visible(page, '#conflicto.ver') && (await fila('lejos2')).fecha === await page.evaluate(() => addDaysISO(hoyISO(), 10)), 'no la mueve a un día donde la psicóloga ya está ocupada');
  await page.fill('#cFechaIn', await page.evaluate(() => addDaysISO(hoyISO(), 11)));
  await page.tap('#cGuardar'); await page.waitForTimeout(300);
  ok((await fila('lejos2')).fecha === await page.evaluate(() => addDaysISO(hoyISO(), 11)) && (await page.textContent('#toast')).includes('Cita movida'), 'cambiar el día mueve la cita');
  ok(await page.evaluate(() => estado.fechaAgenda === addDaysISO(hoyISO(), 11)), 'la agenda se va al nuevo día para verla');
  await page.tap('nav.tabs button[data-vista=expediente]'); await page.waitForTimeout(200);
  ok(await page.$$eval('#listaPx .px-tag.gris', t => t.some(x => x.textContent === 'no asistió')), 'en "Hoy" del expediente se ve "no asistió" en vez de "falta nota"');
  await page.evaluate(() => { estado.cobrosPeriodo = { tipo: 'rango', desde: addDaysISO(hoyISO(), -7), hasta: hoyISO() }; });
  await page.tap('nav.tabs button[data-vista=cobros]'); await page.waitForTimeout(200);
  corte = await page.textContent('#corte');
  ok(corte.includes('Sesiones dadas (agenda)') && /sin cobro registrado/.test(corte), 'el corte de Dirección muestra sesiones de la agenda y las que no tienen cobro');
  ok(await ancho(page) <= 414, 'sin scroll horizontal en el corte');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  console.log('Corte visto por soporte');
  page = await abrir(browser, 'd2');
  await page.evaluate(async () => { __DB.pagos.push({ id: 'gd1', paciente_id: 'p1', psicologa_id: 'd1', monto: 800, metodo: 'transferencia', validado: true, creado_en: new Date().toISOString() }); await refrescar(); irA('cobros'); });
  const bloqueDir = await page.$$eval('#corte .psic', b => (b.find(x => x.textContent.includes('Laura Gómez')) || {}).textContent || '');
  ok(bloqueDir.includes('Dirección') && bloqueDir.includes('Íntegro para Dirección') && !(await page.textContent('#corte')).includes('Soporte Técnico'),
    'las sesiones de la directora salen con su nombre, no con el de quien mira');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  console.log('Lo que le toca a la psicóloga');
  page = await abrir(browser, 'd1');
  await page.tap('nav.tabs button[data-vista=expediente]'); await page.tap('#btnNuevoPx'); await page.waitForTimeout(250);
  await page.selectOption('#paAsignada', 's1');
  await page.fill('#paNombre', 'PRUEBA Haniel'); await page.fill('#paTarifa', '290'); await page.fill('#paPagoPsic', '150');
  await page.tap('#paGuardar'); await page.waitForTimeout(400);
  const nuevoPx = await page.evaluate(() => __DB.pacientes.find(p => p.nombre === 'PRUEBA Haniel'));
  ok(nuevoPx && nuevoPx.tarifa === 290 && nuevoPx.pago_psicologa === 150, 'al dar de alta se guarda cuánto se cobra y cuánto le toca a la psicóloga');
  // Semana sola de Fernanda: 2 sesiones de Haniel (le tocan 150 c/u) y 1 de Mateo sin monto capturado (mitad de 600)
  const corteDe = await page.evaluate(async id => {
    __DB.citas = __DB.citas.filter(c => c.psicologa_id !== 's1'); __DB.pagos = __DB.pagos.filter(g => g.psicologa_id !== 's1');
    __DB.pacientes.find(p => p.id === 'p1').pago_psicologa = null;
    const f = addDaysISO(hoyISO(), -1), c = (i, pac, h) => ({ id: i, fecha: f, hora: h, duracion: 30, psicologa_id: 's1', paciente_id: pac, estado: 'programada', confirmada_por: null });
    __DB.citas.push(c('t1', id, '10:00:00'), c('t2', id, '11:00:00'), c('t3', 'p1', '12:00:00'));
    const g = (i, pac, m, met) => ({ id: i, paciente_id: pac, psicologa_id: 's1', monto: m, metodo: met, validado: true, creado_en: new Date(f + 'T13:00:00').toISOString() });
    __DB.pagos.push(g('q1', id, 290, 'efectivo'), g('q2', id, 290, 'transferencia'), g('q3', 'p1', 600, 'efectivo'));
    estado.cobrosPeriodo = { tipo: 'rango', desde: f, hasta: f }; await refrescar(); irA('cobros');
    return [...document.querySelectorAll('#corte .psic')].find(b => b.textContent.includes('Fernanda')).innerText;
  }, nuevoPx.id);
  ok(/Le toca \(3 sesiones\)\s*\$600/.test(corteDe), 'le toca 150 + 150 + 300 (mitad de la tarifa de quien no tiene monto) = $600');
  ok(/Ella te entrega\s*\$290/.test(corteDe), 'si ella tiene $890 en efectivo y le tocan $600, ella entrega $290');
  ok(corteDe.includes('mitad de su tarifa'), 'avisa cuando un paciente no tiene capturado lo que le toca');
  ok(await page.evaluate(() => { const t = document.querySelector('table.pagos'); return t.scrollWidth <= t.parentElement.clientWidth + 1; }) && await ancho(page) <= 414, 'los cobros se ven como tarjetas, sin desbordarse');
  await page.evaluate(() => { estado.fechaAgenda = addDaysISO(hoyISO(), -1); irA('agenda'); setVistaAgenda('dia'); });
  ok(await page.$eval('.ev[data-cita="t1"]', e => e.classList.contains('corta') && e.querySelector('.r').getBoundingClientRect().bottom <= e.getBoundingClientRect().bottom + 1),
    'una cita de 30 min muestra nombre y hora en un renglón, sin cortarse');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  console.log('Salir con pendientes y cierres');
  page = await abrir(browser, 's1');
  await page.evaluate(async () => {
    const c = (id, pac) => ({ id, fecha: hoyISO(), hora: '00:00:00', duracion: 1, psicologa_id: 's1', paciente_id: pac, estado: 'programada', confirmada_por: null });
    __DB.citas = __DB.citas.filter(x => !(x.psicologa_id === 's1' && x.fecha === hoyISO())); __DB.citas.push(c('fin1', 'p1'), c('fin2', 'p2'));
    __DB.notas.push({ id: 'nf1', paciente_id: 'p1', psicologa_id: 's1', texto: 'Nota hecha', revisada: false, vista_psic: true, creado_en: new Date().toISOString() });
    __DB.pagos = __DB.pagos.filter(g => !(g.psicologa_id === 's1' && (g.paciente_id === 'p1' || g.paciente_id === 'p2'))); await refrescar(); });
  await page.click('#identidad'); await page.waitForTimeout(150); await page.click('#cuentaSalir'); await page.waitForTimeout(250);
  const filasCierre = await page.$$eval('#cierreLista .conf-fila', f => f.map(x => x.innerText.replace(/\s+/g, ' ')));
  ok(filasCierre.length === 2 && filasCierre.some(x => x.includes('Mateo') && x.includes('falta asistencia y cobro') && !x.includes('Nota') && x.includes('No vino')) && filasCierre.some(x => x.includes('Valentina') && x.includes('falta asistencia, cobro y nota')),
    'al salir dice qué paciente quedó sin nota o sin cobro');
  await page.tap('#cierreLista .conf-fila:has-text("Valentina") .btn >> text="🚫 No vino"'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => __DB.citas.find(c => c.id === 'fin2').estado) === 'no_asistio' && await visible(page, '#modalCierre.abierto')
    && (await page.$$eval('#cierreLista .conf-fila', f => f.length)) === 1, '"No vino" la marca y regresa a la lista con lo que falta');
  await page.tap('#cierreLista .conf-fila:has-text("Mateo") .btn >> text="✅ Asistió"'); await page.waitForTimeout(300);
  ok(await visible(page, '#modalPago.abierto') && await page.inputValue('#pPaciente') === 'p1', 'si ya hizo la nota, el botón la lleva directo al cobro de ese paciente');
  await page.tap('#pGuardar'); await page.waitForTimeout(400);
  ok(!(await visible(page, '#modalCierre.abierto')) && (await page.textContent('#toast')).includes('Todo documentado'), 'con todo documentado avisa que ya puede salir');
  await page.evaluate(async () => { __DB.pagos = __DB.pagos.filter(g => g.cita_id !== 'fin1'); __DB.citas.find(c => c.id === 'fin2').estado = 'programada'; await refrescar(); });
  await page.click('#identidad'); await page.waitForTimeout(150); await page.click('#cuentaSalir'); await page.waitForTimeout(250);
  await page.click('#modalCierre .pie .fantasma'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => { const x = __DB.cierres.at(-1); return x && x.notas_pendientes === 1 && x.cobros_pendientes === 2 && x.detalle.length === 2 && x.detalle.some(d => d.pac === 'p1' && !d.nota && d.cobro); }),
    'el cierre guarda qué pacientes quedaron pendientes');
  page = await abrir(browser, 'd1');
  await page.evaluate(async () => { __DB.cierres.push({ id: 'ci1', psicologa_id: 's1', notas_pendientes: 1, cobros_pendientes: 1, fecha: hoyISO(), hora: '20:30', creado_en: new Date().toISOString(),
    detalle: [{ cita: null, pac: 'p2', nota: true, cobro: false }, { cita: null, pac: 'p1', nota: false, cobro: true }] });
    __DB.pagos.push({ id: 'pz', paciente_id: 'p1', psicologa_id: 's1', monto: 600, metodo: 'efectivo', validado: false, creado_en: new Date().toISOString() });
    __DB.notas = __DB.notas.filter(n => !(n.paciente_id === 'p2' && n.creado_en >= new Date(hoyISO() + 'T00:00').toISOString())); await refrescar(); irA('equipo'); });
  const cierreTxt = await page.textContent('#controlCard');
  ok(cierreTxt.includes('Valentina') && cierreTxt.includes('falta nota') && cierreTxt.includes('ya registró ✓'), 'Dirección ve por paciente qué faltó y si ya lo registró después');
  await page.tap('#controlCard .rev-btn'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => __DB.cierres.find(x => x.id === 'ci1').revisado_por === 'd1') && !(await page.textContent('#controlCard')).includes('Valentina'), '"✓ Revisado" lo quita de la lista');
  ok(await ancho(page) <= 414, 'sin scroll horizontal en Equipo');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  console.log('Avisos al teléfono');
  page = await abrir(browser, 's1');
  await page.tap('#identidad'); await page.waitForTimeout(200);
  ok((await page.textContent('#cuentaAvisos')).includes('No disponibles'), 'si la función "avisar" no está en Supabase, Mi cuenta dice que los avisos no están disponibles');
  for (const [disp, nombre] of [[devices['iPhone 11'], 'iPhone'], [devices['Pixel 5'], 'Android']]) {
    const ctx = await browser.newContext({ ...disp, locale: 'es-MX', timezoneId: 'America/Mexico_City' });
    const p = await ctx.newPage(); p.errores = []; p.on('pageerror', e => p.errores.push(String(e)));
    await p.route('**/*', r => { const u = r.request().url();
      if (u.includes('supabase-js')) return r.fulfill({ contentType: 'application/javascript', body: mock });
      if (u.includes('/functions/v1/avisar')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ publica: 'BPruebaPublica' }) });
      if (u.includes('supabase.co')) return r.abort();
      return r.continue(); });
    await p.goto('file://' + FILE + '?como=s1'); await p.waitForTimeout(800);
    ok(await p.$eval('#identidad', b => b.getBoundingClientRect().height >= 44) && await p.evaluate(() => document.documentElement.scrollWidth) <= disp.viewport.width
      && (await p.textContent('#identidad')).includes('Fernanda'), `${nombre}: el nombre en el encabezado es un botón de 44 px y no se desborda`);
    await p.tap('#identidad'); await p.waitForTimeout(200);
    const avTxt = await p.textContent('#cuentaAvisos');
    if (nombre === 'iPhone') ok(avTxt.includes('Agregar a pantalla de inicio'), 'iPhone sin instalar: Mi cuenta explica que primero hay que instalar la app');
    else ok(avTxt.includes('Apagados') && !!(await p.$('#cuentaAvisos .btn >> text="Activar"')), 'Android: Mi cuenta ofrece activar los avisos');
    ok(await p.evaluate(() => document.documentElement.scrollWidth) <= disp.viewport.width, `${nombre}: Mi cuenta no se desborda`);
    ok(p.errores.length === 0, `${nombre}: sin errores en consola ` + (p.errores.join(' | ') || ''));
    await ctx.close();
  }

  console.log('Mi cuenta');
  page = await abrir(browser, 'd1');
  await page.tap('#identidad'); await page.waitForTimeout(200);
  ok(await visible(page, '#modalCuenta.abierto') && (await page.textContent('#cuentaYo')).includes('Laura'), 'tocar el nombre abre Mi cuenta');
  await page.tap('.seg-tema button >> text="Oscuro"'); await page.waitForTimeout(100);
  const fondoOsc = await page.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor, localStorage.getItem('tema')]);
  ok(fondoOsc[0] === 'oscuro' && fondoOsc[1] === 'rgb(22, 20, 27)' && fondoOsc[2] === 'oscuro', 'elegir Oscuro cambia la app y se recuerda en el teléfono');
  await page.reload(); await page.waitForTimeout(700);
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'oscuro', 'al volver a abrir sigue oscuro');
  await page.tap('#identidad'); await page.waitForTimeout(150); await page.tap('.seg-tema button >> text="Automático"'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => document.documentElement.dataset.theme === 'claro' && localStorage.getItem('tema') === null), 'Automático sigue al teléfono (aquí, claro)');
  await page.tap('.fila-aj .btn >> text="Cambiar"'); await page.waitForTimeout(200);
  await page.fill('#clave1', 'corta'); await page.fill('#clave2', 'corta'); await page.tap('#claveGuardar'); await page.waitForTimeout(150);
  ok((await page.textContent('#toast')).includes('8 caracteres'), 'la contraseña nueva pide al menos 8 caracteres');
  await page.fill('#clave1', 'NuevaClave2026'); await page.fill('#clave2', 'NuevaClave2025'); await page.tap('#claveGuardar'); await page.waitForTimeout(150);
  ok((await page.textContent('#toast')).includes('no son iguales'), 'y que se escriba igual dos veces');
  await page.fill('#clave2', 'NuevaClave2026'); await page.tap('#claveGuardar'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => JSON.stringify(window.__AUTH)) === JSON.stringify([['updateUser', { password: 'NuevaClave2026' }]]) && !(await visible(page, '#modalClave.abierto')),
    'cambia la contraseña de su propia cuenta');
  ok(await ancho(page) <= 414, 'sin scroll horizontal');
  await page.evaluate(() => window.__authEvento('PASSWORD_RECOVERY', {})); await page.waitForTimeout(450);
  ok(await visible(page, '#modalClave.abierto') && (await page.textContent('#claveTitulo')).includes('nueva'), 'al llegar por el enlace del correo pide la contraseña nueva');
  await page.evaluate(() => cerrar('modalClave'));
  await page.tap('#identidad'); await page.waitForTimeout(150); await page.tap('#cuentaSalir'); await page.waitForTimeout(300);
  await page.evaluate(() => { cerrar('modalCierre'); cerrarSesion(); }); await page.waitForTimeout(300);
  await page.tap('.link-btn'); await page.waitForTimeout(150);
  ok((await page.textContent('#toast')).includes('Escribe tu correo'), '"¿Olvidaste tu contraseña?" pide primero el correo');
  await page.fill('#loginEmail', 'laura@prueba.mx'); await page.tap('.link-btn'); await page.waitForTimeout(200);
  const rs = await page.evaluate(() => window.__AUTH.at(-1));
  ok(rs[0] === 'reset' && rs[1] === 'laura@prueba.mx' && rs[2].redirectTo.startsWith('file://') && (await page.textContent('#toast')).includes('te llegó un enlace'),
    'y manda el enlace al correo, de vuelta a la app');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  console.log('Al volver a la app');
  page = await abrir(browser, 's1');
  await page.evaluate(() => { __DB.citas.push({ id: 'otraPC', fecha: estado.fechaAgenda, hora: '20:00:00', duracion: 60, psicologa_id: 's1', paciente_id: 'p1', estado: 'programada', confirmada_por: null }); });
  ok(!(await page.$('.ev[data-cita="otraPC"]')), 'una cita agendada en otro aparato no aparece sola si se cortó la conexión');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(300);
  ok(!!(await page.$('.ev[data-cita="otraPC"]')), 'al volver a la app se recarga y aparece');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  console.log('La directora valida al final del día');
  page = await abrir(browser, 'd1');
  await page.evaluate(async () => {
    const f = addDaysISO(hoyISO(), 0), c = (id, psic, pac) => ({ id, fecha: f, hora: '00:00:00', duracion: 1, psicologa_id: psic, paciente_id: pac, estado: 'programada', confirmada_por: null });
    __DB.citas = __DB.citas.filter(x => !(x.estado === 'no_asistio' && !x.confirmada_por)); __DB.pagos.forEach(g => g.validado = true);
    __DB.citas.push(c('mia1', 'd1', 'p3'), c('mia2', 'd1', 'p4'), c('suya1', 's1', 'p1'));
    __DB.pagos.push({ id: 'gs1', paciente_id: 'p1', psicologa_id: 's1', monto: 600, metodo: 'efectivo', validado: false, cita_id: 'suya1', creado_en: new Date().toISOString() });
    await refrescar(); });
  await page.evaluate(() => { menuCita('mia1'); }); await page.waitForTimeout(200);
  await page.tap('#accBotones .acc-btn >> text="✅ Asistió · registrar cobro"'); await page.waitForTimeout(250);
  await page.tap('#pGuardar'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => { const g = __DB.pagos.find(x => x.cita_id === 'mia1'); return g && g.validado === false && g.psicologa_id === 'd1'; }), 'el cobro de la directora también queda por validar');
  await page.click('#identidad'); await page.waitForTimeout(150); await page.click('#cuentaSalir'); await page.waitForTimeout(250);
  const cierreDir = (await page.textContent('#modalCierre')).replace(/\s+/g, ' ');
  ok(await visible(page, '#modalCierre.abierto') && /falta asistencia, cobro y nota/.test(cierreDir) && cierreDir.includes('Validar el día · 2 por validar'),
    'al salir, a la directora le pide su sesión pendiente y validar el día');
  await page.tap('#cierreValidar .acc-btn'); await page.waitForTimeout(250);
  ok((await page.textContent('#accTitulo')) === 'Por validar' && await page.$$eval('#accBotones .conf-fila', f => f.length) === 2, 'la lista "Por validar" trae los cobros del día, de todas');
  await page.tap('#accBotones .acc-btn >> text=/Validar los 2 cobros/'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => __DB.pagos.every(g => g.validado)) && !(await visible(page, '#modalAcciones.abierto')) && await page.textContent('#badgeAg') === '', '"Validar los 2 cobros" los valida y ya no queda nada');
  ok(await ancho(page) <= 414, 'sin scroll horizontal');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  console.log('Expediente por psicóloga y facturas');
  page = await abrir(browser, 'd1');
  await page.tap('nav.tabs button[data-vista=expediente]'); await page.waitForTimeout(200);
  const grupos = await page.$$eval('.px-grupo-btn', b => b.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  ok(grupos.length === 3 && grupos.some(g => g.startsWith('Fernanda Ruiz 4')) && !(await page.$('.px-grupo-btn + .px-lista')),
    `Dirección ve un renglón por psicóloga con cuántos pacientes tiene, cerrados (${grupos.join(' | ')})`);
  await page.tap('.px-grupo-btn[data-grupo="s1"]'); await page.waitForTimeout(150);
  ok(await page.$$eval('.px-grupo-btn[data-grupo="s1"] + .px-lista .px-fila', f => f.length) === 4, 'al tocarla se abren sus pacientes');
  await page.tap('.px-grupo-btn[data-grupo="s1"]'); await page.waitForTimeout(150);
  ok(!(await page.$('.px-grupo-btn[data-grupo="s1"] + .px-lista')), 'y se vuelve a cerrar');
  await page.fill('#buscaPx', 'regina'); await page.waitForTimeout(150);
  ok(!(await page.$('.px-grupo-btn')) && (await page.$$eval('#listaPx .px-fila b', b => b.map(x => x.textContent).join())) === 'Regina Martínez Soto', 'al buscar se ve la lista directa');
  await page.fill('#buscaPx', '');
  ok(await ancho(page) <= 414, 'sin scroll horizontal');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));
  page = await abrir(browser, 's1');
  await page.tap('nav.tabs button[data-vista=expediente]'); await page.waitForTimeout(200);
  ok(!(await page.$('.px-grupo-btn')) && (await page.$$eval('#listaPx .px-fila', f => f.length)) > 0, 'la psicóloga ve su lista sin grupos');
  await page.tap('nav.tabs button[data-vista=facturas]'); await page.tap('#facAccion .btn'); await page.waitForTimeout(250);
  ok(!(await visible(page, '#campoFMonto')) && await visible(page, '#fAvisoPsic'), 'al avisar una factura, la psicóloga no captura monto');
  await page.tap('#modalFactura .btn.naranja'); await page.waitForTimeout(300);
  const fac = await page.evaluate(() => __DB.facturas.at(-1));
  ok(fac.solicitada_por === 's1' && fac.monto === 0 && fac.estado === 'solicitada', 'queda el aviso con monto por definir');
  ok(!(await page.textContent('#facturas')).includes('$'), 'la psicóloga no ve montos en sus avisos');
  page = await abrir(browser, 'd1');
  await page.evaluate(() => { __DB.facturas.push({ id: 'fx', paciente_id: 'p1', monto: 0, estado: 'solicitada', solicitada_por: 's1', fecha_solicitada: hoyISO() }); return refrescar(); });
  await page.tap('nav.tabs button[data-vista=facturas]'); await page.waitForTimeout(200);
  ok((await page.textContent('#facturas')).includes('monto por definir'), 'Dirección ve "monto por definir"');
  await page.evaluate(() => avanzarFactura('fx')); await page.waitForTimeout(300);
  ok(await visible(page, '#modalFactura.abierto') && await visible(page, '#campoFMonto') && await page.evaluate(() => __DB.facturas.find(f => f.id === 'fx').estado) === 'solicitada',
    'no se puede emitir sin monto: abre la hoja para ponerlo');
  await page.fill('#fMonto', '650'); await page.tap('#modalFactura .btn.naranja'); await page.waitForTimeout(300);
  await page.evaluate(() => avanzarFactura('fx')); await page.waitForTimeout(300);
  ok(await page.evaluate(() => { const f = __DB.facturas.find(x => x.id === 'fx'); return f.monto === 650 && f.estado === 'emitida'; }), 'con el monto ya se emite');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  console.log('Paciente de la directora');
  page = await abrir(browser, 'd1');
  await page.evaluate(() => { irA('expediente'); abrirPaciente(); });
  ok(await page.inputValue('#paAsignada') === 'd1' && !(await visible(page, '#paPagoCampo')) && (await page.textContent('#paPagoHint')).includes('no hay reparto'),
    'al dar de alta un paciente suyo, la directora no captura "le toca a la psicóloga"');
  await page.selectOption('#paAsignada', 's1');
  ok(await visible(page, '#paPagoCampo'), 'si lo asigna a otra psicóloga, aparece el campo');
  await page.fill('#paPagoPsic', '300');   // lo escribe y luego se lo asigna a ella: no debe guardarse
  await page.selectOption('#paAsignada', 'd1'); await page.fill('#paNombre', 'PRUEBA Directora');
  await page.tap('#paGuardar'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => { const p = __DB.pacientes.find(x => x.nombre === 'PRUEBA Directora'); return p && p.asignada_a === 'd1' && p.pago_psicologa === null; }), 'se guarda sin monto para la psicóloga');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  console.log('Nota dictada, WhatsApp, historial y horarios libres');
  page = await abrir(browser, 'd1');
  await page.evaluate(() => {
    window.__dictado = 'Trabajamos la rutina de la mañana'; window.__final = null; window.__mics = 0; window.__espera = 40;
    // Micrófono simulado: stop() todavía entrega el resultado final antes de terminar; abort() termina sin más resultados
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { window.__mics++; this.vivo = true; setTimeout(() => this.onresult && this.onresult({ results: [[{ transcript: window.__dictado }]] }), 30); }
      stop() { setTimeout(() => { if (window.__final && this.onresult) this.onresult({ results: [[{ transcript: window.__final }]] }); this.fin(); }, window.__espera); }
      abort() { setTimeout(() => this.fin(), 10); }
      fin() { if (this.vivo) { this.vivo = false; window.__mics--; } if (this.onend) this.onend(); }
    };
    irA('expediente'); seleccionarPx('p1'); abrirNota(); });
  await page.waitForTimeout(150);
  await page.fill('#nTexto', 'Llegó contento.');
  await page.tap('#mic-nTexto'); await page.waitForTimeout(150);
  ok((await page.inputValue('#nTexto')) === 'Llegó contento. Trabajamos la rutina de la mañana' && (await page.textContent('#mic-nTexto')) === '⏹',
    'el 🎤 de un apartado dicta y se agrega a lo que ya estaba escrito');
  await page.tap('#mic-nTexto'); await page.waitForTimeout(100);
  ok((await page.textContent('#mic-nTexto')) === '🎤', 'tocarlo otra vez deja de escuchar');
  await page.fill('#nTexto', ''); await page.fill('#nDudas', 'Solo una duda');
  await page.tap('#modalNota .pie .btn:not(.fantasma)'); await page.waitForTimeout(250);
  ok((await page.textContent('#toast')).includes('qué se trabajó') && await visible(page, '#modalNota.abierto'), 'sin "Qué se trabajó" no se guarda');
  const nuevaNota = async () => { await page.evaluate(() => { cerrar('modalNota'); abrirNota(); }); await page.waitForTimeout(80); };
  await nuevaNota(); await page.tap('#mic-nConducta'); await page.waitForTimeout(80);
  const oyendo = await page.evaluate(() => window.__mics);
  await page.touchscreen.tap(200, 20); await page.waitForTimeout(120);   // fuera de la hoja
  ok(oyendo === 1 && await page.evaluate(() => window.__mics) === 0 && !(await visible(page, '#modalNota.abierto')), 'cerrar la hoja tocando fuera mientras dicta apaga el micrófono');
  await nuevaNota(); await page.tap('#mic-nConducta'); await page.waitForTimeout(80);
  await page.keyboard.press('Escape'); await page.waitForTimeout(120);
  ok(await page.evaluate(() => window.__mics) === 0, 'con Escape también se apaga');
  await nuevaNota(); await page.evaluate(() => { window.__final = 'esto ya no debe entrar'; });
  await page.tap('#mic-nTexto'); await page.waitForTimeout(80);
  await page.type('#nTexto', ' y lo escribí yo'); await page.waitForTimeout(150);
  ok(await page.inputValue('#nTexto') === 'Trabajamos la rutina de la mañana y lo escribí yo' && await page.evaluate(() => window.__mics) === 0
    && (await page.textContent('#mic-nTexto')) === '🎤', 'si escribe a mano mientras dicta, el dictado se detiene y no borra lo escrito');
  await nuevaNota(); await page.evaluate(() => { window.__final = 'Trabajamos la rutina completa'; });
  await page.tap('#mic-nTexto'); await page.waitForTimeout(80);
  await page.tap('#nGuardar'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => __DB.notas.at(-1).texto) === '▸ Qué se trabajó\nTrabajamos la rutina completa' && await page.evaluate(() => window.__mics) === 0,
    'guardar mientras dicta espera las últimas palabras');
  await nuevaNota(); await page.evaluate(() => { window.__final = 'Trabajó turnos con calma'; window.__espera = 400; window.__nNotas = __DB.notas.length; });
  await page.tap('#mic-nTexto'); await page.waitForTimeout(80);
  await page.evaluate(() => { document.getElementById('nGuardar').click(); document.getElementById('nGuardar').click(); });
  await page.waitForTimeout(100);
  const esperando = await page.evaluate(() => { const b = document.getElementById('nGuardar'); return b.disabled && b.textContent === 'Guardando…'; });
  await page.touchscreen.tap(200, 20); await page.keyboard.press('Escape'); await page.waitForTimeout(700);
  ok(esperando && await page.evaluate(() => __DB.notas.length - window.__nNotas) === 1 && await page.evaluate(() => __DB.notas.at(-1).texto) === '▸ Qué se trabajó\nTrabajó turnos con calma'
    && (await page.textContent('#toast')).includes('Nota guardada'), 'mientras guarda dice "Guardando…", cerrar la hoja no lo cancela y dos toques guardan una sola nota');
  await page.evaluate(() => { window.__espera = 40; });
  // Algunos teléfonos repiten lo ya dicho en cada pedazo; la nota no debe salir doble
  const uni = await page.evaluate(() => [
    unirDictado(['Llegó contento', ' y trabajó bien']),
    unirDictado(['Llegó contento', 'Llegó contento y trabajó', 'Llegó contento y trabajó bien']),
    unirDictado(['llegó contento', 'y trabajó bien', 'Llegó contento y trabajó bien.']),
    unirDictado(['Llegó contento.', 'Llegó contento.', 'Se frustró']),
    unirDictado(['Llegó contento llegó contento']),
    unirDictado(['Llegó contento y', 'contento y trabajó bien']),
    unirDictado(['Llegó contento', 'se frustró']),
    unirDictado(['No', 'no quiso']),
    unirDictado(['Llegó contento al consultorio', 'Llegó contenta al consultorio y trabajó']),
    unirDictado(['Llegó contento al consultorio', 'Después jugó con bloques']),
  ]);
  ok(JSON.stringify(uni) === JSON.stringify(['Llegó contento y trabajó bien', 'Llegó contento y trabajó bien', 'Llegó contento y trabajó bien.',
    'Llegó contento. Se frustró', 'Llegó contento', 'Llegó contento y trabajó bien', 'Llegó contento se frustró', 'no quiso',
    'Llegó contenta al consultorio y trabajó', 'Llegó contento al consultorio Después jugó con bloques']),
    `el dictado no repite lo que el teléfono manda dos veces (${uni.join(' | ')})`);
  await nuevaNota();
  await page.evaluate(() => { const Antes = window.SpeechRecognition;
    window.SpeechRecognition = window.webkitSpeechRecognition = class extends Antes {   // como algunos Android: cada pedazo trae todo lo anterior
      start() { super.start(); const r = [], dar = t => { r.push([{ transcript: t }]); this.onresult && this.onresult({ results: r.slice() }); };
        setTimeout(() => dar('Llegó contento'), 50); setTimeout(() => dar('Llegó contento y trabajó'), 70); setTimeout(() => dar('Llegó contento y trabajó turnos'), 90); }
    };
    window.__dictado = ''; });
  await page.tap('#mic-nConducta'); await page.waitForTimeout(200);
  ok(await page.inputValue('#nConducta') === 'Llegó contento y trabajó turnos', `al dictar en un teléfono que repite, el apartado no sale doble (${await page.inputValue('#nConducta')})`);
  await page.evaluate(() => { cerrar('modalNota'); window.__dictado = 'Trabajamos la rutina de la mañana';
    window.SpeechRecognition = window.webkitSpeechRecognition = Object.getPrototypeOf(window.SpeechRecognition); });   // vuelve el micrófono simulado normal
  // Dictar un comentario de una nota
  await page.evaluate(() => { irA('expediente'); seleccionarPx('p1'); const n = document.querySelector('.nota .com-toggle'); n && n.click(); });
  await page.waitForTimeout(200);
  const nid = await page.evaluate(() => { const b = document.querySelector('[id^="micc-"]'); return b && b.id.slice(5); });
  ok(!!nid, 'los comentarios de una nota tienen 🎤');
  if (nid) {
    await page.evaluate(() => { window.__dictado = 'Bien, sigan así'; window.__final = null; });
    await page.tap('#micc-' + nid); await page.waitForTimeout(150);
    ok(await page.inputValue('#com-' + nid) === 'Bien, sigan así' && (await page.textContent('#micc-' + nid)) === '⏹', 'dictar escribe el comentario');
    const antes = await page.evaluate(() => __DB.comentarios ? __DB.comentarios.length : null);
    await page.evaluate(id => agregarComentario(id), nid); await page.waitForTimeout(300);
    ok(await page.evaluate(() => window.__mics) === 0, 'al enviarlo se apaga el micrófono');
    await page.tap('#micc-' + nid).catch(() => {}); await page.waitForTimeout(80);
    await page.evaluate(() => irA('agenda')); await page.waitForTimeout(80);
    ok(await page.evaluate(() => window.__mics) === 0, 'cambiar de pestaña mientras dicta un comentario apaga el micrófono');
  }
  await page.evaluate(() => { window.__dictado = 'Trabajamos la rutina de la mañana'; });
  // WhatsApp
  const wa = await page.evaluate(async () => {
    const f = addDaysISO(hoyISO(), 1);
    __DB.pacientes.find(p => p.id === 'p1').telefono = '833 123 4567';
    __DB.citas.push({ id: 'wa1', fecha: f, hora: '17:30:00', duracion: 60, psicologa_id: 's1', paciente_id: 'p1', estado: 'programada', confirmada_por: null });
    __DB.citas.push({ id: 'wa2', fecha: f, hora: '18:30:00', duracion: 60, psicologa_id: 's1', paciente_id: 'p3', estado: 'programada', confirmada_por: null });
    __DB.pacientes.find(p => p.id === 'p3').telefono = '';
    await refrescar(); let abierto = null; window.open = u => { abierto = u; };
    menuCita('wa2'); const sinTel = [...document.querySelectorAll('#accBotones .acc-btn')].some(b => b.textContent.includes('WhatsApp'));
    menuCita('wa1'); const conTel = [...document.querySelectorAll('#accBotones .acc-btn')].find(b => b.textContent.includes('WhatsApp'));
    conTel.click(); return { sinTel, abierto };
  });
  ok(!wa.sinTel && wa.abierto && wa.abierto.startsWith('https://wa.me/528331234567?text=')
    && decodeURIComponent(wa.abierto.split('text=')[1]) === 'Hola, le recordamos la cita de Mateo mañana a las 5:30 pm en Mundo Neurodiverso. ¿Nos confirma su asistencia? ¡Gracias!',
    `"Recordar por WhatsApp" abre WhatsApp al teléfono del paciente con el mensaje listo (${wa.abierto && decodeURIComponent(wa.abierto.split('text=')[1])})`);
  // Historial en la ficha
  const hist = await page.evaluate(async () => {
    const c = (id, n, est) => ({ id, fecha: addDaysISO(hoyISO(), n), hora: '15:00:00', duracion: 60, psicologa_id: 's1', paciente_id: 'p1', estado: est, confirmada_por: null });
    __DB.citas = __DB.citas.filter(x => x.paciente_id !== 'p1' || x.id === 'wa1');
    __DB.citas.push(c('h1', -7, 'programada'), c('h2', -14, 'no_asistio'), c('h3', -21, 'no_asistio'), c('h4', -28, 'programada'), c('h5', -35, 'cancelada'));
    await refrescar(); irA('expediente'); seleccionarPx('p1');
    return [...document.querySelectorAll('.px-dato')].map(d => d.innerText.replace(/\s+/g, ' ').trim());
  });
  ok(hist.some(x => x.startsWith('PRÓXIMA CITA') && x.includes('17:30')) || hist.some(x => /pr[oó]xima cita/i.test(x) && x.includes('17:30')), `la ficha dice la próxima cita (${hist.find(x => /cita/i.test(x))})`);
  ok(hist.some(x => /asistencia/i.test(x) && x.includes('2 sesiones · 2 faltas · falta seguido')) && !!(await page.$('.px-dato dd.falta-seguido')), 'y cuántas sesiones y faltas lleva, marcando si falta seguido');
  ok(await page.$eval('.px-dato a.wa', a => a.href) === 'https://wa.me/528331234567', 'junto al teléfono hay un enlace a su WhatsApp');
  const tels = await page.$$eval('.px-dato dd.tels a', l => l.map(a => a.getBoundingClientRect().height));
  ok(tels.length === 2 && tels.every(h => h >= 44), 'llamar y WhatsApp son botones de 44 px');
  const telLargo = await page.evaluate(async () => { __DB.pacientes.find(p => p.id === 'p1').telefono = '833 123 4567 (mamá) / 833 765 4321 (papá)'; await refrescar(); seleccionarPx('p1');
    const a = document.querySelector('.px-dato dd.tels a'); return { ancho: a.closest('.px-dato').classList.contains('ancho'), wa: !!document.querySelector('.px-dato a.wa'), alto: a.getBoundingClientRect().height }; });
  ok(telLargo.ancho && !telLargo.wa && telLargo.alto <= 70, `un teléfono largo sin WhatsApp usa todo el ancho (${telLargo.alto} px de alto)`);
  await page.evaluate(async () => { __DB.pacientes.find(p => p.id === 'p1').telefono = '833 123 4567'; await refrescar(); });
  // ¿Dónde cabe?
  const lib = await page.evaluate(async () => {
    const d = new Date(); d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7) + 7);   // miércoles de la próxima semana
    const f = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    __DB.citas = __DB.citas.filter(x => !(x.psicologa_id === 's2' && x.fecha === f));
    __DB.citas.push({ id: 'o1', fecha: f, hora: '15:00:00', duracion: 60, psicologa_id: 's2', paciente_id: 'p3', estado: 'programada' },
                    { id: 'o2', fecha: f, hora: '17:00:00', duracion: 90, psicologa_id: 's2', paciente_id: 'p4', estado: 'programada' },
                    { id: 'o3', fecha: f, hora: '19:00:00', duracion: 60, psicologa_id: 's2', paciente_id: 'p8', estado: 'cancelada' },
                    { id: 'o4', fecha: f, hora: '21:30:00', duracion: 60, psicologa_id: 's2', paciente_id: 'p8', estado: 'programada' });
    await refrescar(); irA('agenda'); abrirCita('14:00', f); const s = document.getElementById('cPsic'); s.value = 's2'; s.dispatchEvent(new Event('change'));
    const primero = document.querySelector('#cLibres .libre-dia');
    return { f, quien: document.getElementById('cLibresQuien').textContent, dia: primero && [...primero.querySelectorAll('.libre')].map(b => b.textContent) };
  });
  ok(lib.quien === 'Andrea Torres' && JSON.stringify(lib.dia) === JSON.stringify(['14:00–15:00', '16:00–17:00', '18:30–21:00']),
    `"¿Dónde cabe?" muestra los huecos libres de la psicóloga ese día, sin pasar del cierre; las canceladas no ocupan (${(lib.dia || []).join(', ')})`);
  await page.selectOption('#cDur', '90'); await page.waitForTimeout(100);
  ok(JSON.stringify(await page.$$eval('#cLibres .libre-dia:first-child .libre', b => b.map(x => x.textContent))) === JSON.stringify(['18:30–21:00']), 'con 90 min solo deja los huecos donde cabe');
  await page.tap('#cLibres .libre-dia:first-child .libre'); await page.waitForTimeout(100);
  ok(await page.inputValue('#cHora') === '18:30' && await page.inputValue('#cFechaIn') === lib.f, 'tocar un hueco pone ese día y esa hora en la hoja');
  ok(await ancho(page) <= 414, 'sin scroll horizontal');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));
  page = await abrir(browser, 's1');
  const dts = await page.evaluate(() => { irA('expediente'); seleccionarPx('p1'); return [...document.querySelectorAll('.px-dato dt')].map(d => d.textContent); });
  ok(dts.includes('Tu próxima cita') && dts.includes('Tus sesiones') && !dts.includes('Teléfono'), `la psicóloga ve que esos datos son de sus propias citas (${dts.join(', ')})`);
  const cubre = await page.evaluate(async () => {
    const otro = __DB.pacientes.find(p => p.asignada_a && p.asignada_a !== 's1' && p.activo !== false);
    __DB.citas.push({ id: 'cb1', fecha: addDaysISO(hoyISO(), 3), hora: '15:00:00', duracion: 60, psicologa_id: 's1', paciente_id: otro.id, estado: 'programada', confirmada_por: null });
    await refrescar(); irA('expediente'); seleccionarPx(otro.id);
    const d = [...document.querySelectorAll('.px-dato')].find(x => x.querySelector('dt').textContent === 'Tu próxima cita');
    return d && d.querySelector('dd').textContent;
  });
  ok(cubre && cubre.includes('15:00') && !cubre.includes('Fernanda'), `si cubre a un paciente de otra, su próxima cita no repite su nombre (${cubre})`);

  console.log('Modo pruebas');
  page = await abrir(browser, 'd1');
  await page.goto(page.url().replace('?como=', '?pruebas=1&como=')); await page.waitForTimeout(600);
  await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7) + 7);
    estado.fechaAgenda = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); setVistaAgenda('dia'); });
  let hp = await page.evaluate(() => [...document.querySelectorAll('#agenda .etq')].map(e => e.textContent));
  ok(hp[0] === '07:00' && hp.at(-1) === '22:00' && await visible(page, '#rolBanner.ver'), `con ?pruebas=1 la agenda va de 7 a 22 h, también en domingo (${hp[0]}–${hp.at(-1)})`);
  await page.goto(page.url().replace('?pruebas=1&', '?')); await page.waitForTimeout(600);
  ok(await visible(page, '#rolBanner.ver'), 'el modo pruebas se queda en ese teléfono');
  await page.click('#rolBanner button'); await page.waitForTimeout(600);
  ok(!(await visible(page, '#rolBanner.ver')), '"Quitar" lo apaga');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  page = await abrir(browser, 's1');
  await page.goto(page.url().replace('?como=', '?pruebas=1&como=')); await page.waitForTimeout(600);
  ok(!(await visible(page, '#rolBanner.ver')) && await page.evaluate(() => horarioDe(addDaysISO(hoyISO(), 0)) === null || horarioDe(addDaysISO(hoyISO(), 0))[0] !== 7), 'a una psicóloga el modo pruebas no le cambia nada');
  await page.tap('#identidad'); await page.waitForTimeout(150);
  ok(!(await page.textContent('#cuentaCuerpo')).includes('Modo pruebas'), 'y en Mi cuenta no le aparece');

  console.log('Deslizar entre pestañas');
  page = await abrir(browser, 'd1');
  await page.evaluate(() => { window.__desliza = (x1, x2, y = 400, sel) => { const el = sel ? document.querySelector(sel) : document.elementFromPoint(x1, y);
    const tc = x => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [tc(x1)], changedTouches: [tc(x1)] }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [tc(x2)] })); }; });
  const vista = () => page.evaluate(() => document.body.dataset.vista);
  await page.evaluate(() => irA('agenda'));
  await page.evaluate(() => __desliza(320, 120)); ok(await vista() === 'expediente', 'deslizar a la izquierda pasa a la siguiente pestaña');
  await page.evaluate(() => __desliza(320, 120)); ok(await vista() === 'cobros', 'y otra vez a la que sigue');
  await page.evaluate(() => __desliza(100, 300)); ok(await vista() === 'expediente', 'a la derecha regresa a la anterior');
  await page.evaluate(() => { irA('agenda'); __desliza(100, 300); }); ok(await vista() === 'agenda', 'en la primera no hace nada hacia la derecha');
  await page.evaluate(() => __desliza(10, 250)); ok(await vista() === 'agenda', 'desde la orilla no hace nada (ahí está el gesto de regresar del teléfono)');
  await page.evaluate(() => __desliza(320, 290)); ok(await vista() === 'agenda', 'un movimiento corto no cambia de pestaña');
  await page.evaluate(() => { abrirCuenta(); __desliza(320, 120); }); ok(await vista() === 'agenda', 'con una hoja abierta no cambia de pestaña');
  await page.evaluate(() => { cerrar('modalCuenta'); irA('expediente'); seleccionarPx('p1'); __desliza(320, 120); });
  ok(await vista() === 'expediente', 'en el detalle de un paciente no cambia de pestaña');
  await page.evaluate(() => { volverPx(); irA('cobros'); });
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'scrollPrueba'; d.style.cssText = 'overflow-x:auto; height:80px';
    d.innerHTML = '<div style="width:1200px; height:80px"></div>'; document.getElementById('v-cobros').prepend(d); window.scrollTo(0, 0);
    const r = d.getBoundingClientRect(); __desliza(300, 100, r.top + 40, '#scrollPrueba'); });
  ok(await vista() === 'cobros', 'dentro de algo que se desplaza de lado (como una tabla) no cambia de pestaña');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  console.log('Dirección en computadora');
  page = await abrir(browser, 'd1', { viewport: { width: 1280, height: 800 } });
  ok(await page.evaluate(() => estado.vistaAgenda) === 'semana', 'en computadora Dirección empieza en la semana');
  await page.click('nav.tabs button[data-vista=expediente]');
  ok(await visible(page, '.px-col-lista') && await visible(page, '.px-col-detalle'), 'lista y expediente lado a lado');
  ok(!(await visible(page, '.px-barra')), 'sin barra "‹ Pacientes" en computadora');
  await page.evaluate(() => { estado.pacientes.forEach(p => gruposPx.add(p.asignada || '')); renderExpediente(); });
  const pasos = await page.evaluate(() => history.length);
  await page.click('#listaPx .px-lista:last-child .px-fila >> nth=2'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => history.length) === pasos, 'elegir paciente no agrega pasos al historial');
  await page.screenshot({ path: require('os').tmpdir() + '/expediente-escritorio.png' });
  await page.click('nav.tabs button[data-vista=agenda]'); await page.click('.sem-col .ev >> nth=0'); await page.waitForTimeout(250);
  ok(await visible(page, '#modalAcciones.abierto'), 'en la semana, tocar una cita abre sus opciones');
  ok(page.errores.length === 0, 'sin errores en consola ' + (page.errores.join(' | ') || ''));

  await browser.close();
  console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})();
