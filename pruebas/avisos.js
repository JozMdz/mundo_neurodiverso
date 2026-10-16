// Prueba la función de avisos (supabase/functions/avisar/index.ts) sin Supabase ni teléfonos:
// qué aviso toca a quién y a qué hora, que el cifrado se pueda descifrar como lo hace un teléfono,
// y que la firma VAPID sea válida. Uso: node pruebas/avisos.js
const crypto = require('crypto');
const http = require('http');
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fallas++; };
const b64u = b => Buffer.from(b).toString('base64url');

// Descifra como un teléfono (RFC 8291), con el módulo crypto de Node: otra implementación distinta a la función
function descifrar(cuerpo, telPriv, telPub, auth) {
  const sal = cuerpo.subarray(0, 16), idlen = cuerpo[20], suPub = cuerpo.subarray(21, 21 + idlen), datos = cuerpo.subarray(21 + idlen);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(telPriv);
  const compartido = ecdh.computeSecret(suPub);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', compartido, auth, Buffer.concat([Buffer.from('WebPush: info\0'), telPub, suPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(datos.subarray(-16));
  const claro = Buffer.concat([d.update(datos.subarray(0, -16)), d.final()]);
  return claro.subarray(0, claro.lastIndexOf(2)).toString();
}

(async () => {
  const f = await import('../supabase/functions/avisar/index.ts');

  console.log('Reglas');
  // Jueves 15 oct 2026 (horario 14–21). Hora de México = UTC − 6
  const en = hm => new Date(`2026-10-15T${hm}:00-06:00`);
  const base = (ahora, extra = {}) => ({ ahora, enviados: new Set(),
    psicologas: [{ id: 'dir', nombre: 'Mtra. Sara Díaz', es_direccion: true }, { id: 'sop', nombre: 'José', es_direccion: true }, { id: 'w', nombre: 'Psic. Wendy Martínez', es_direccion: false }],
    pacientes: [{ id: 'p1', nombre: 'Haniel Ruiz Soto' }, { id: 'p2', nombre: 'Mateo' }],
    citas: [{ id: 'c1', fecha: '2026-10-15', hora: '15:00:00', duracion: 60, psicologa_id: 'w', paciente_id: 'p1', estado: 'programada', confirmada_por: null },
            { id: 'c2', fecha: '2026-10-15', hora: '17:00:00', duracion: 60, psicologa_id: 'w', paciente_id: 'p2', estado: 'cancelada', confirmada_por: 'dir' }],
    notas: [], pagos: [], cierres: [], ...extra });
  const claves = d => f.avisosPendientes(d).map(a => a.clave);
  ok(claves(base(en('10:00'))).length === 0, 'fuera del horario no avisa nada');
  let a = f.avisosPendientes(base(en('14:50')));
  ok(a.length === 1 && a[0].clave === 'antes:c1' && a[0].para.join() === 'w' && a[0].body === 'H. R. · en 10 min', `10 min antes avisa a la psicóloga: «${a[0] && a[0].title} · ${a[0] && a[0].body}»`);
  ok(!JSON.stringify(a).includes('Haniel'), 'el aviso lleva iniciales, no el nombre del paciente');
  ok(claves(base(en('14:50'), { enviados: new Set(['antes:c1']) })).length === 0, 'no repite un aviso ya mandado');
  ok(!claves(base(en('16:40'))).includes('antes:c1') && !claves(base(en('16:40'))).some(c => c.includes('c2')), 'no avisa de citas canceladas');
  a = f.avisosPendientes(base(en('16:15')));
  ok(a.some(x => x.clave === 'falta:c1' && x.body === '15:00 H. R.: nota y cobro'), 'al terminar, si falta nota y cobro, le avisa');
  const hoy = '2026-10-15T22:05:00Z';   // 16:05 en México
  a = f.avisosPendientes(base(en('16:15'), { notas: [{ paciente_id: 'p1', psicologa_id: 'w', creado_en: hoy }] }));
  ok(a.some(x => x.clave === 'falta:c1' && x.body.endsWith(': cobro')), 'si ya hizo la nota, solo le recuerda el cobro');
  a = f.avisosPendientes(base(en('16:15'), { notas: [{ paciente_id: 'p1', psicologa_id: 'w', creado_en: hoy }], pagos: [{ paciente_id: 'p1', psicologa_id: 'w', creado_en: hoy }] }));
  ok(!a.some(x => x.clave === 'falta:c1'), 'con nota y cobro no hay recordatorio');
  a = f.avisosPendientes(base(en('16:15'), { citas: [{ id: 'c3', fecha: '2026-10-15', hora: '15:00:00', duracion: 60, psicologa_id: 'w', paciente_id: 'p2', estado: 'no_asistio', confirmada_por: null }] }));
  ok(a.length === 1 && a[0].clave === 'noasis:c3' && a[0].para.join() === 'dir,sop' && a[0].body === 'Wendy: 15:00 M.', 'una inasistencia por confirmar le avisa a Dirección');
  a = f.avisosPendientes(base(en('19:00'), { cierres: [{ id: 'x1', psicologa_id: 'w', creado_en: en('18:58').toISOString(), notas_pendientes: 1, cobros_pendientes: 2 }] }));
  ok(a.some(x => x.clave === 'cierre:x1' && x.body === 'Wendy: 1 nota y 2 cobros sin registrar'), 'si alguien sale con pendientes, le avisa a Dirección');
  a = f.avisosPendientes(base(en('21:20')));
  const r = a.find(x => x.clave === 'resumen:2026-10-15');
  ok(r && r.para.join() === 'dir,sop' && r.title === 'Hoy: 1 sesión' && r.body === '1 sin nota · 1 sin cobro', `a las 21:15 manda el resumen a Dirección: «${r && r.title} · ${r && r.body}»`);
  ok(f.avisosPendientes(base(new Date('2026-10-17T15:20:00-06:00'))).some(x => x.clave === 'resumen:2026-10-17') === false
    && f.avisosPendientes(base(new Date('2026-10-17T18:20:00-06:00'))).some(x => x.clave === 'resumen:2026-10-17'), 'el sábado el resumen llega después de las 18:15');

  console.log('Cifrado y firma');
  const tel = crypto.createECDH('prime256v1'); tel.generateKeys();
  const auth = crypto.randomBytes(16);
  const sub = { p256dh: b64u(tel.getPublicKey()), auth: b64u(auth) };
  const texto = JSON.stringify({ title: 'Cita a las 15:00', body: 'H. R. · en 10 min ✓' });
  const cuerpo = Buffer.from(await f.cifrar(texto, sub.p256dh, sub.auth));
  let claro = ''; try { claro = descifrar(cuerpo, tel.getPrivateKey(), tel.getPublicKey(), auth); } catch (e) { claro = 'error: ' + e.message; }
  ok(claro === texto, 'el teléfono descifra el aviso (con otra implementación)');
  ok(!cuerpo.includes(Buffer.from('15:00')), 'el contenido viaja cifrado');
  ok(cuerpo.readUInt32BE(16) === 4096 && cuerpo[20] === 65, 'encabezado aes128gcm correcto');

  // Llaves VAPID como las genera herramientas/llaves-avisos.html
  const v = await crypto.webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publica = b64u(new Uint8Array(await crypto.webcrypto.subtle.exportKey('raw', v.publicKey)));
  const privada = (await crypto.webcrypto.subtle.exportKey('jwk', v.privateKey)).d;
  // Un servicio de avisos de mentira que recibe el envío
  let recibido = null;
  const srv = http.createServer((req, res) => { const t = []; req.on('data', c => t.push(c)); req.on('end', () => { recibido = { h: req.headers, b: Buffer.concat(t) }; res.statusCode = 201; res.end(); }); });
  await new Promise(r => srv.listen(0, r));
  const st = await f.enviarPush({ endpoint: `http://127.0.0.1:${srv.address().port}/push/abc`, ...sub }, texto, { publica, privada, correo: 'consultorio@ejemplo.mx' });
  srv.close();
  ok(st === 201 && recibido.h['content-encoding'] === 'aes128gcm' && recibido.h.ttl, 'manda el aviso con los encabezados correctos');
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(recibido.h.authorization || '');
  let firmaOk = false;
  if (m && m[2] === publica) {
    const [hdr, pld, sig] = m[1].split('.');
    const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(Buffer.from(publica, 'base64url').subarray(1, 33)), y: b64u(Buffer.from(publica, 'base64url').subarray(33)) }, format: 'jwk' });
    const datos = JSON.parse(Buffer.from(pld, 'base64url'));
    firmaOk = crypto.verify('sha256', Buffer.from(hdr + '.' + pld), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))
      && datos.aud.startsWith('http://127.0.0.1:') && datos.sub === 'mailto:consultorio@ejemplo.mx' && datos.exp > Date.now() / 1000;
  }
  ok(firmaOk, 'la firma VAPID es válida y dice a qué servicio va');
  ok(descifrar(recibido.b, tel.getPrivateKey(), tel.getPublicKey(), auth) === texto, 'lo que llega al servicio se descifra bien');

  console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})();
