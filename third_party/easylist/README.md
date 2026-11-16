# EasyList y EasyPrivacy

Autores: The EasyList authors — https://easylist.to/

Fuentes oficiales:
- https://easylist.to/easylist/easylist.txt
- https://easylist.to/easylist/easyprivacy.txt

Se utiliza la opción de licencia Creative Commons Attribution-ShareAlike 3.0 Unported ofrecida por los autores. Texto completo: `LICENSE-CC-BY-SA-3.0.txt`. Las fuentes originales se conservan aquí con sus cabeceras y versiones; los hashes se registran en `assets/filters/manifest.json`.

Modificaciones: Chromium ruleset_converter transforma el subconjunto compatible de reglas de URL y selectores CSS a su formato binario. Se normalizan dominios negativos como excepciones y se omite sintaxis de ocultación no compatible. Las excepciones de activación cosmética se conservan además en `assets/filters/CosmeticExceptions.inc`, derivado de estas fuentes con la misma licencia: algunas restricciones de ruta/opciones se amplían al dominio para evitar ocultaciones incorrectas. Un patrón de excepción desconocido suprime conservadoramente la categoría afectada. El manifiesto registra cantidades, límites aplicados y hashes de ambos archivos. No se afirma compatibilidad completa con el formato de EasyList.

Preparación: `tools/prepare_filter_snapshot.py`; validación y copia al árbol de Chromium: `tools/sync_filter_snapshot.py`. No se distribuye un snapshot nuevo si falla la validación o conversión. Las actualizaciones automáticas todavía no están implementadas.
