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
4. Áreas táctiles de **44 px** o más. Nada puede depender de `:hover`.
5. Campos de texto con letra de **16 px** o más: con menos, Safari hace zoom al escribir.
6. La navegación son las pestañas fijas abajo (`nav.tabs`). Las ventanas (`.fondo-modal`) suben desde
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

## Agenda

El horario de consulta está en la constante `HORARIO` de `index.html` (por día de la semana, 0 = domingo):
lunes a viernes de 14 a 21 h y sábado de 8 a 18 h. La agenda muestra solo esas horas; si una cita cae
fuera, se amplía para mostrarla. En la semana, las horas sin consulta de cada día se ven rayadas. En el
celular la agenda empieza en la vista de día; en computadora, Dirección empieza en la semana.

Agendar por voz (solo Dirección, botón 🎤): `dictarCita()` escucha en es-MX y `entenderCita()` interpreta
paciente, psicóloga ("con Andrea"), día, hora, duración y repetición ("todos los martes y jueves… por un
mes"). Sin "de la tarde", la hora se elige dentro del `HORARIO` de ese día. Abre la hoja de cita ya llena
para confirmar: nunca guarda sola. Las frases de prueba están en `pruebas/flujos.js`.

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
```

`d1` entra como Dirección y `s1` como psicóloga. Antes de subir un cambio visual, revisa las capturas
a 414 px y que `flujos.js` termine en "Todo bien".
