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
