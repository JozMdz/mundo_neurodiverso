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
9. Lo que escriben las usuarias (notas, comentarios, nombres) se inserta en el HTML con `esc()`.

Identidad visual: los colores de `:root` (morado, verde, cian, rosa, naranja, amarillo) y las
tipografías Fredoka (títulos) y Nunito (texto).

## Cómo revisar en tamaño iPhone 11

`pruebas/` tiene un Supabase falso con datos inventados. Nunca toca la base real: bloquea `*.supabase.co`.

```bash
export NODE_PATH=$(npm root -g)                  # Playwright instalado de forma global
node pruebas/flujos.js "$PWD/index.html"          # recorre el expediente en iPhone 11 y en computadora
node pruebas/captura.js "$PWD/index.html" /tmp/cap d1 "js=irA('expediente')" "shot=lista"
```

`d1` entra como Dirección y `s1` como psicóloga. Antes de subir un cambio visual, revisa las capturas
a 414 px y que `flujos.js` termine en "Todo bien".
