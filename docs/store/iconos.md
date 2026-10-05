# Ícono y splash provisorios

Los archivos de `mobile/assets/` se generan con un script a partir de un SVG simple (un comprobante con un tilde verde sobre fondo azul `#1F4E79`):

```
node mobile/scripts/generate-icons.mjs     # desde la raíz del repo
```

| Archivo | Uso | Tamaño |
|---|---|---|
| `icon.png` | Ícono de iOS y base de Android. Sin transparencia (Apple la rechaza) | 1024×1024 |
| `adaptive-icon.png` | Primer plano del ícono adaptativo de Android (transparente, dibujo dentro de la zona segura) | 1024×1024 |
| `splash-icon.png` | Imagen del splash, centrada sobre `#1F4E79` | 1024×1024 |
| `favicon.png` | Web | 48×48 |

Referencias en `mobile/app.config.ts`: `icon`, `android.adaptiveIcon` y `web.favicon`.

## Splash pendiente de activar

En el SDK 57 el campo `splash` ya no existe en la configuración: se usa el plugin `expo-splash-screen`, que **no está instalado** en el proyecto (T6.4 no instala paquetes). `splash-icon.png` ya está generado. Para activarlo:

1. `npx expo install expo-splash-screen` en `mobile/`.
2. Agregar a `plugins` en `app.config.ts`:
   ```ts
   ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 200, resizeMode: 'contain', backgroundColor: '#1F4E79' }],
   ```
3. Verificar con `EXPO_OFFLINE=1 npx expo export --platform android` y en un build de desarrollo.

## Cómo reemplazarlos por los definitivos

1. Reemplazar los PNG de `mobile/assets/` conservando los nombres y tamaños (o cambiar las rutas en `app.config.ts`). `icon.png`: 1024×1024, sin transparencia ni esquinas redondeadas (las tiendas las aplican). `adaptive-icon.png`: 1024×1024 con transparencia, con lo importante dentro del círculo central de unos 660 px.
2. No volver a correr el script, porque pisaría los definitivos (o borrarlo si ya no se usa).
3. Si cambia el color de marca, actualizar `backgroundColor` del splash y del ícono adaptativo en `app.config.ts`.
4. El ícono se incorpora en el siguiente build (`eas build`); no se actualiza con OTA.
