# Inicio de Senda

Fuentes: HTML, CSS y los dos módulos TypeScript. Los `.js` son salida generada para una vista previa local y no se versionan. Chromium compila los `.ts` mediante `build_webui` y su política estricta de tipos.

Las pruebas `node --test tests/new-tab-state.test.mjs` compilan las fuentes estrictamente a `.tools/home-tests` antes de validar comportamiento. Requieren las dependencias de desarrollo ya descargadas de Chromium.

Para generar los módulos de la vista previa, desde la raíz del proyecto:

```powershell
node .chromium/src/third_party/node/node_modules/typescript/bin/tsc --target ESNext --module ESNext --moduleResolution bundler --lib DOM,DOM.Iterable,ESNext --strict --noUncheckedIndexedAccess --noPropertyAccessFromIndexSignature --skipLibCheck --outDir ui/new-tab ui/new-tab/senda_home.ts ui/new-tab/senda_home_state.ts
```

El parche 0002 contiene la copia empaquetada en el navegador. No modificar esas copias sin actualizar también las fuentes y regenerar el parche.
