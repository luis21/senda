# Actualización de listas: validación en curso

## Tarea 1 — generación coherente (2026-11-17)

Se incorporaron las excepciones cosméticas al proto y al índice FlatBuffer de las reglas. El documento consulta su propio índice, eliminando la dependencia de la cabecera de excepciones compilada. El formato indexado pasa de 38 a 39; el snapshot empaquetado pasa a esquema 2. El SHA-256 incluye las excepciones, incluso si no cambian las reglas de red.

Verificaciones realizadas:

- Prueba nativa inicialmente fallida por APIs ausentes; después 4/4 casos pasan: serialización completa, compatibilidad de bytes con el empaquetador Python, generaciones simultáneas y fallback conservador sin metadatos.
- Pruebas Python: los casos nuevos fallaron antes de implementar; resultado final 18/18.
- Compilados los puntos de integración de Blink y del renderer con cuatro tareas.
- Replay de 11 parches sobre la revisión fijada: PASS; 89 archivos coinciden con el checkout.
- Snapshot: 106891 reglas de red, 23533 reglas cosméticas compiladas; 5352714 bytes; SHA-256 `094ed4a33596da4edd2181f273b68715a59c66fcb4466fb84fc38289f86a58fb`.

Todavía no se declara completado el actualizador: faltan conversión aislada, almacenamiento, descargas, panel y pruebas finales del navegador. No se ha recompilado el ejecutable completo tras este cambio.

## Tarea 2 — conversor nativo y servicio de utilidad

Se implementó un conversor que recibe handles de dos fuentes y un archivo de salida. Valida títulos, UTF-8, versión/fecha, tamaños y líneas; conserva excepciones y normaliza dominios negativos. Tiene límites de salida, metadatos y memoria de selectores, incluyendo su expansión por dominios excluidos. Se registró una interfaz Mojo con sandbox `kService`, sin fábrica de red.

- Once pruebas nativas pasan, incluidas las listas completas vendorizadas: 106891 reglas de red y 23533 visuales, iguales a los contadores del generador actual.
- Conversión más indexación y verificación de la salida completa: 3954 ms en esta ejecución. No es una medición de descarga ni una promesa de latencia.
- Se reprodujo y corrigió una omisión de 224 selectores con punto y coma dentro de atributos entre comillas; su prueba falló antes de corregir el analizador.
- Se compilaron el servicio Mojo, sus tipos generados y su registro en utilidad. La prueba de aislamiento, desconexión y vida del proceso real queda para la integración con el cliente del navegador; todavía no se declara verificada en ejecución.
- Replay de 12 parches y comparación con el checkout: PASS.
