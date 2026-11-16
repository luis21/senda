# Ahorro de memoria de Senda

> Ejecución: superpowers:executing-plans, un implementador en esta sesión.

**Objetivo:** activar ahorro automático de pestañas inactivas con protección de actividad, exclusiones y medición del árbol de procesos.

**Arquitectura:** adaptar MemorySaverModePolicy de Chromium y sus preferencias existentes. No crear otro administrador de procesos ni debilitar aislamiento/sandbox. Diseño aprobado: `docs/superpowers/specs/2026-10-31-senda-design.md`, sección Memoria y rendimiento; umbrales delegados al implementador.

**Decisión:** ahorro activado por defecto, nivel medio. Esperas conservador=60 minutos, equilibrado=15 y agresivo=5. Conservar ajustes explícitos de usuario y empresa. Frente a cambiar únicamente un interruptor (esperas actuales de 2–6 horas) o crear un mecanismo propio, esta adaptación usa las protecciones y reactivación del motor existente.

**Decisión tras medición:** desactivar por defecto `TrackEmptyRendererProcessesForReuse` en Windows. El primer A/B suspendió páginas pero no redujo memoria privada del árbol; una prueba aislada de una sola pestaña con esa caché desactivada liberó procesos y memoria. Se conserva aislamiento y se acepta el coste potencial de recrear procesos al navegar. No forzar terminación ignorando referencias activas. Repetir el A/B sobre el binario final, sin usar el flag de diagnóstico.

El experimento de desarrollo reactiva esa función junto a `TransientKeepAlivePolicy`, por lo que el arranque establece ambas desactivadas antes de las variaciones mediante `ScopedAddFeatureFlags`, respetando elecciones explícitas de línea de comandos. La prueba final comprueba los valores efectivos y la reducción del árbol completo, no solo el estado visual de las pestañas.

## Verificaciones y límites

- Pestañas activas, audio/captura, interacción de formularios, fijadas, DevTools y exclusiones mantienen las comprobaciones de elegibilidad originales.
- Las pestañas descargadas se identifican con la interfaz nativa y se recargan al seleccionarlas. No prometer conservar datos que un sitio no persiste.
- Comparar el mismo binario con ahorro desactivado y activado. Perfiles nuevos, mismas páginas sintéticas locales y sin extensiones. No confundirlo con una comparación frente al Chrome comercial.
- Medir bytes privados, working set y CPU del árbol de procesos; el working set agregado puede contar páginas compartidas más de una vez.
- Registrar descarte automático, exclusión y reactivación sin llamar a discard manual para producir el ahorro. Desconectar DevTools de las páginas medidas.
- Comparación temporal del modo máximo (5 minutos), sin acelerar el reloj ni forzar descarte. Verificar por separado el valor inicial equilibrado; su espera de 15 minutos queda documentada en el parche. La protección de diez minutos exclusiva de urgencia no se aplica al descarte programado: su temporizador ya exige la inactividad elegida. Las demás condiciones se conservan.
- No compilar toda la infraestructura de pruebas de Chromium. Pruebas de navegador reales y comprobaciones acotadas del parche.

## Pasos

- [x] Crear fixture/medición y observar RED de configuración inicial en binario previo.
- [x] Cambiar estado inicial y tiempos en prefs.cc y memory_saver_mode_policy.cc; actualizar expectativas relevantes de sus pruebas y exportar parche 0004.
- [x] Compilar con cuatro tareas y verificar ajustes iniciales/respeto de ajustes explícitos.
- [x] Ejecutar comparación A/B reproducible y comprobar exclusión, actividad y reactivación.
- [x] Documentar mediciones, límites y pendientes.
- [x] Reabrir Senda después de cerrar los procesos de prueba; ventana visible `Nueva pestaña - Senda` confirmada.

No hay commit: repositorio inicial sin identidad y escritura de .git restringida, según decisión ya registrada. Mantener parches reproducibles.
