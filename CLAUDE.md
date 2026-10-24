# Mundo Neurodiverso — Sistema del consultorio

App de un solo archivo: `index.html` trae HTML, CSS y JavaScript juntos, sin build ni dependencias.
Los datos y la sesión viven en Supabase (`@supabase/supabase-js@2` por CDN).

## Diseño: primero el celular

Casi siempre se usa desde el celular. El dispositivo de referencia es un **iPhone 11**:

- Pantalla de 414 × 896 pt (@2x). En Safari quedan unos **414 × 715** útiles.
- Tiene notch y barra de inicio. Lo que toque los bordes (encabezado, pestañas, hojas, avisos)
  usa `env(safe-area-inset-*)`.

Reglas:

1. Diseña y revisa primero a **414 px de ancho**. La computadora debe seguir funcionando, pero es secundaria.
2. El corte para celular es `@media (max-width:860px)` en CSS y `MOVIL` (un `matchMedia`) en JS.
   No agregues otros cortes.
3. Nada puede causar scroll horizontal de la página. Lo que no quepa, como las tablas, va dentro de un
   contenedor con `overflow-x:auto` (`.tabla-scroll`). En grids usa `minmax(0,1fr)` y en hijos flex `min-width:0`.
4. Debe verse bien también en Android (revisa con `DISPOSITIVO='Pixel 5'` en `captura.js`). Áreas táctiles de **44 px** o más. Nada puede depender de `:hover`.
5. Campos de texto con letra de **16 px** o más: con menos, Safari hace zoom al escribir.
6. La navegación son las pestañas fijas abajo (`nav.tabs`); en el celular también se cambia de pestaña deslizando a los
   lados (no desde la orilla, ni con una hoja abierta, ni dentro de algo que se desplaza de lado, ni en el detalle de un paciente). Las ventanas (`.fondo-modal`) suben desde
   abajo como hojas de iOS.
7. Lista → detalle: en el celular el detalle se abre a pantalla completa, con "‹ Regresar" arriba y un
   paso en el historial para que funcione el gesto de regresar del iPhone. El modelo es Expediente
   (`seleccionarPx`, `volverPx`).
8. Borrar y editar van en una hoja de opciones (`menuNota` / `modalAcciones`), no como íconos chicos
   junto a otros botones.
9. Lo que escriben las usuarias (notas, comentarios, nombres, método de pago…) se inserta en el HTML
   con `esc()`, también dentro de atributos y de `<option>`.

Identidad visual: los colores de `:root` (morado, verde, cian, rosa, naranja, amarillo) y las
tipografías Fredoka (títulos) y Nunito (texto).

Modo oscuro: `aplicarTema` (arriba, en el `<head>`) pone `data-theme="oscuro"` o `"claro"` en `<html>`, según el
teléfono (Automático) o lo elegido en Mi cuenta (se guarda en ese dispositivo). Los colores van siempre como variables de
`:root` (`--tarjeta`, `--suave`, `--texto2`…) y `:root[data-theme="oscuro"]` las redefine; no escribas colores claros fijos
(`#fff`, `#F6F3FB`…) en CSS ni en el HTML que arma el JS. Revisa las capturas con `OSCURO=1` en `captura.js`.

## Agenda

El horario de consulta está en la constante `HORARIO` de `index.html` (por día de la semana, 0 = domingo):
lunes a viernes de 14 a 21 h y sábado de 8 a 18 h. La agenda muestra solo esas horas; si una cita cae
fuera, se amplía para mostrarla. En la semana, las horas sin consulta de cada día se ven rayadas. En el
celular la agenda empieza en la vista de día; en computadora, Dirección empieza en la semana. En el celular la semana
es una lista por día (`renderSemanaLista`): al tocar un día se abre su vista de día; la cuadrícula queda para computadora.

Agendar por voz (solo Dirección, botón 🎤): `dictarCita()` escucha en es-MX y `entenderCita()` interpreta
paciente, psicóloga ("con Andrea"), día, hora, duración y repetición ("todos los martes y jueves… por un
mes"). Sin "de la tarde", la hora se elige dentro del `HORARIO` de ese día. Abre la hoja de cita ya llena
para confirmar: nunca guarda sola. Las frases de prueba están en `pruebas/flujos.js`.

Estado de las citas (`sql/citas-estado.sql`): una cita que ya pasó cuenta como **atendida** y pide nota y cobro.
Al tocar una cita se abre su hoja de opciones (`menuCita`): nota, cobro con la tarifa del paciente y "No asistió".
Todo lo marcado queda **por confirmar** hasta que Dirección lo corrobora (aviso arriba de la agenda y
`verPorConfirmar`), también lo que marca la directora. Solo Dirección cancela, reactiva, reagenda y cambia
de día (campo Día en la hoja de cita). Canceladas y "no asistió" no piden nota ni cobro ni ocupan el horario.
Corte de Cobros (`corteDe`, sesión por sesión): cada sesión dada de la agenda (ya terminó, o ya empezó y se cobró)
se empareja con su cobro: primero el ligado a la cita (`pagos.cita_id`, de cualquier fecha o psicóloga; si es de otro
periodo, la sesión sale pagada y el dinero cuenta en ese otro corte), luego uno sin cita del mismo paciente y día, y luego
de otro día. Un cobro ligado a una sesión de otro periodo solo cuenta como dinero; uno sin cita y sin sesión cuenta como
sesión dada. Lo acordado (`repartoPac`): se cobra la `tarifa` del paciente y a quien da la sesión le toca lo suyo, sea de
quien sea el paciente (si cubre a otra o a la directora): `reparto_psicologas` (`sql/reparto.sql`), que Dirección pone en
Equipo como monto fijo por sesión o porcentaje; sin ponerlo, la mitad. Lo que da la directora es íntegro para Dirección.
`pacientes.pago_psicologa` ya no se usa. Dirección elige psicóloga con
chips (`estado.cortePsic`, `verCortePsic`): primero la directora, luego las psicólogas y al final "Todas" (lo del
consultorio y qué hacer con cada una); sin elegir se ve la primera. Va de lo general a lo particular y pensado para
leerse fácil (la directora tiene discalculia): primero el resumen en renglones que cuadran entre sí (`lineaRes`: vinieron,
se acordó cobrar por esas sesiones con su desglose por paciente y total, de eso ya se cobró con su desglose por forma de
pago y total, falta cobrar, pagaron menos/más, pagos de otros días); luego, en grande, qué hacer (`accionCorte` /
`cajaAccion`: "Le pagas a X $…" / "X te entrega $…", y abajo paso a paso con el efectivo: cobró en efectivo → de eso se
queda lo que le toca → te entrega el resto; aparte, "Ya tienes en tu cuenta" con lo de transferencia y tarjeta, que la
psicóloga no ve; en el corte de la directora no va esta caja); y abajo `detalleCorte` día por día: quién vino y a qué
hora, cómo pagó y quién tiene el dinero, lo acordado y cuánto le toca a ella y al consultorio (en las sesiones de la
directora no va reparto: todo es de Dirección). La parte del consultorio no va en los resúmenes. Mantén ese estilo: una cifra por renglón, palabras antes que signos, nada que haya que restar de cabeza. La psicóloga ve qué pacientes tuvo y cuánto le toca,
sin tarifas, sin la parte del consultorio y sin lo que se cobró, ni en efectivo, para no ponerlo junto a lo que le toca
(su caja: le tocan → se lo queda del efectivo → entrega el resto). El monto de un cobro suyo solo lo ve en `menuCobro`, para
corregirlo, y ahí nunca el de transferencia o tarjeta. Periodos: hoy, semana (lunes a domingo), mes y rango. Excel exporta el
corte sesión por sesión. `sesionesDe` (hoja de la cita) usa las mismas reglas.

Se documenta al final de la jornada: al salir, si una psicóloga (o la directora) tiene sesiones de hoy sin documentar
(`pendientesHoy`), la hoja "Antes de salir" las lista por paciente con Nota, Asistió (cobro) y No vino, y regresa a la
lista después de cada una (`seguirCierre`). Si sale así, el cierre guarda el detalle (`sql/cierres-detalle.sql`);
en Equipo, Dirección ve qué faltó, si ya se registró después, y lo marca "✓ Revisado" para quitarlo de la lista.

Números en las pestañas (`updateBadges`): lo que hay que revisar o registrar; se quitan solo cuando se hace, no al
verlos. Agenda: por validar (Dirección). Expediente: notas por revisar o mensajes nuevos, más las notas que faltan.
Cobros: sesiones sin cobro (Dirección, las de todas). Facturas: sin entregar (Dirección). Equipo: cierres por revisar.
Lo que falta registrar sale de `pendientesSesiones`: sesiones ya dadas desde `PENDIENTES_DESDE` sin cobro (reglas del
corte) o sin nota de quien la dio (una del mismo día o, si no, una posterior). Arriba de Cobros y del Expediente un aviso
abre la hoja "Falta registrar" (`verPendientes`) con Nota, Asistió y No vino, y se regresa a ella después de cada una;
Dirección no escribe la nota de otra psicóloga.

Avisos al teléfono (push): la función `supabase/functions/avisar/index.ts` corre cada 5 min (`sql/avisos-programar.sql`)
y manda, cifrados y con iniciales del paciente, el aviso de cada cita 30 min antes (a quien atiende y a Dirección, con
el nombre de quien atiende), "Documenta tu día" después de la última cita de cada quien, y a Dirección inasistencias,
cierres y un resumen al cerrar. Cada quien los activa o apaga en su teléfono desde Mi cuenta (`tocarAvisos`, `apagarAvisos`).
Las llaves y la instalación están en `supabase/functions/avisar/LEEME.md`. `node pruebas/avisos.js` prueba reglas y cifrado.

Expediente: Dirección ve a los pacientes agrupados por psicóloga (`gruposPx`, cada grupo se abre y se cierra); al buscar
o filtrar, la lista es directa. El historial (las notas) lo ven Dirección, la psicóloga asignada y a quien Dirección le
dé acceso con "🔓 Historial" (`menuHistorial`, `accesos_expediente`, `sql/acceso-expediente.sql`). Quien solo cubre a un
paciente (tiene una cita con él) ve sus datos y escribe y ve sus propias notas (`veHistorial`); lo hace cumplir `mi_paciente`. Facturas: la psicóloga solo avisa que un paciente la pidió (monto 0 = por definir);
Dirección pone el monto antes de emitirla.

Notas de sesión: se escriben en apartados (`APARTADOS_NOTA`: Qué se trabajó, Conducta y respuesta, Plan para la
próxima sesión, Dudas o pendientes). Se guardan en el mismo `notas.texto`, cada apartado con un encabezado "▸ "
(`textoNota`), y se muestran con `notaFormato`. Solo "Qué se trabajó" es obligatorio. Cada apartado se puede dictar
con 🎤 (`dictarApartado`, es-MX) donde el navegador lo permite, y también los comentarios de una nota (`dictarComentario`). Algunos teléfonos repiten lo ya dicho en cada pedazo:
`unirDictado` lo quita para que la nota no salga doble.
La ficha del paciente muestra su próxima cita, asistencia (sesiones y faltas; avisa si falta seguido) y cuántas notas
tiene. Dirección ve el teléfono con enlace a WhatsApp y, en una cita que no ha empezado, "📲 Recordar por WhatsApp"
(`recordarWhats`) abre WhatsApp con el recordatorio escrito: nunca lo manda sola.
"¿Dónde cabe?" (hoja de cita, solo Dirección): `huecosLibres` lista los horarios libres de la psicóloga elegida en los
próximos días, dentro del `HORARIO` y con la duración de la cita; al tocar uno se llenan día y hora.

Cobro de la sesión (`sql/cobro-cita.sql`): al tocar una cita ya empezada, "✅ Asistió · registrar cobro" abre el cobro con la
tarifa del paciente y lo liga a la cita (`pagos.cita_id`, uno por cita). Nada queda validado solo, ni lo de la directora:
cobros (`validado`) y "no asistió" (`confirmada_por`) los valida Dirección al final del día en "Por validar"
(`verPorConfirmar`), que también le ofrece la hoja "Antes de salir".

Mi cuenta (`abrirCuenta`): al tocar el nombre arriba se abre una hoja con apariencia (Automático / Claro / Oscuro),
avisos en este teléfono, cambiar contraseña (`sb.auth.updateUser`), respaldo (solo Dirección), modo pruebas, actualizar
la app y Salir. El respaldo (`descargarRespaldo`) baja un JSON con todas las tablas que ve Dirección (sin `push_subs` ni
`avisos_enviados`); en el celular se abre "Compartir" para guardarlo en Archivos o Drive.

Equipo (solo Dirección): agregar psicóloga, cambiar su correo, ponerle contraseña temporal y darla de baja o reactivarla
pasan por la función `supabase/functions/equipo` (`llamarEquipo`), la única con la llave de servicio; nombre, teléfono,
cédula y color se guardan directo en `psicologas`, y lo que le toca por sesión en `reparto_psicologas` (RLS: solo
Dirección; la lista muestra a quién le falta). Una psicóloga dada de baja (`activa = false`,
`sql/equipo.sql`) no entra, no aparece para agendar (`atienden`) y sus datos se quedan.
Pacientes: `fecha_nacimiento` (`sql/equipo.sql`); la edad se calcula con `edadDe` / `edadTxt`. `edad` queda para los que no la tienen.
"¿Olvidaste tu contraseña?" en la entrada manda un enlace al correo (`resetPasswordForEmail`, de vuelta a la misma
página); al abrirlo, Supabase avisa `PASSWORD_RECOVERY` y se pide la contraseña nueva. Para que el enlace regrese a la app,
la URL publicada debe estar en Supabase → Authentication → URL Configuration (Site URL y Redirect URLs).

Modo pruebas (solo Dirección y soporte, `pruebasActivo`): abrir la app con `?pruebas=1` amplía la agenda de 7 a 22 h todos los días solo en ese dispositivo
(`?pruebas=0`, el botón "Quitar" o Mi cuenta lo apagan). Los datos siguen siendo los reales.

## Seguridad

- Los permisos los hace cumplir Supabase: las políticas RLS y los triggers de `sql/seguridad.sql`.
  Lo que revisa la app (`esAdmin()`, botones ocultos) es solo para la pantalla: cualquiera con sesión
  puede saltárselo desde el navegador.
- Si agregas una escritura nueva en la app, revisa que la base la permita y que una psicóloga no pueda
  usarla para hacer más de lo que la pantalla le muestra.
- `sql/esquema.sql` es la estructura completa y fiel de la base (tablas, funciones, triggers, políticas,
  permisos, tiempo real). Si cambias la base, cámbialo también; sirve para reconstruirla.
- `sql/revisar.sql` muestra la configuración de seguridad (RLS, políticas, triggers y funciones) y
  `sql/inventario.sql` la estructura completa (columnas, restricciones, índices, permisos, tiempo real,
  conteos y resumen de psicólogas). Ninguna muestra datos de pacientes.
- `pruebas/permisos.py` carga `sql/esquema.sql` con datos inventados en un Postgres local desechable y
  prueba lo que una psicóloga no debe poder hacer y lo que sí. Las instrucciones están al inicio del archivo.
- `sql/citas-estado.sql` agrega el estado de las citas y su trigger (`proteger_citas`): la psicóloga solo marca si
  asistió a sus propias citas, desde el día de la cita, y no cambia lo que Dirección ya confirmó.
- `sql/acceso-expediente.sql`: `mi_paciente` (notas y comentarios) es asignado a ella o con acceso de Dirección; tener una
  cita con el paciente ya no basta para ver su historial.
- `sql/reparto.sql`: lo que le toca a cada psicóloga va en su propia tabla para que cada una lea solo lo suyo
  (la tabla `psicologas` la leen todas). Solo Dirección lo escribe.
- `sql/avisos.sql`: los teléfonos con avisos (`push_subs`) no los lee nadie desde la app; solo se registran o quitan
  con `guardar_suscripcion` / `borrar_suscripcion`, y solo servicios de avisos conocidos. La llave privada vive en los
  Secrets de Supabase, nunca en el repositorio.
- Cuentas: hay dos de Dirección. Una es de soporte y no atiende (`atiende = false`); la otra es la
  directora, que sí atiende. Solo Dirección agenda citas.
- `supabase-js` está fijo en una versión exacta. Súbela a propósito y prueba antes.

## App instalable (iPhone y Android)

Se publica con GitHub Pages desde `main`: https://jozmdz.github.io/mundo_neurodiverso/

- `manifest.webmanifest` + `sw.js` + íconos (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
  `apple-touch-icon.png`). Los íconos son el árbol del logo sobre blanco, sin el texto.
- El service worker va **a la red primero** y solo guarda archivos de este sitio. Los datos de
  pacientes vienen de Supabase y **nunca** deben guardarse en la caché.
- Cambiar `index.html` no requiere nada más. Si cambias `sw.js` o los íconos, sube la versión de
  `CACHE` en `sw.js` (`consultorio-v1` → `consultorio-v2`).
- Sin internet, la app muestra "Sin conexión" con un botón para reintentar.

## Cómo revisar en tamaño iPhone 11

`pruebas/` tiene un Supabase falso con datos inventados. Nunca toca la base real: bloquea `*.supabase.co`.

```bash
export NODE_PATH=$(npm root -g)                  # Playwright instalado de forma global
node pruebas/flujos.js "$PWD/index.html"          # recorre el expediente en iPhone 11 y en computadora
node pruebas/instalable.js "$PWD"                 # manifest, íconos, service worker y modo sin señal
node pruebas/captura.js "$PWD/index.html" /tmp/cap d1 "js=irA('expediente')" "shot=lista"
OSCURO=1 node pruebas/captura.js "$PWD/index.html" /tmp/cap d1 "shot=agenda"   # modo oscuro
```

`d1` entra como Dirección y `s1` como psicóloga. Antes de subir un cambio visual, revisa las capturas
a 414 px y que `flujos.js` termine en "Todo bien".
