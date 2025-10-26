# GeoBogotá

Componente React + TypeScript que permite autocompletar direcciones dentro de Bogotá y copiar sus coordenadas, sin dependencias de mapas embebidos.

## Requisitos previos

- Node.js >= 18
- npm >= 9

## Configuración inicial

1. Clona el repositorio y entra en la carpeta del proyecto.
2. Copia el archivo `.env` incluido y actualiza el valor de `VITE_NOMINATIM_EMAIL` con tu correo electrónico real para cumplir la [política de uso de Nominatim](https://operations.osmfoundation.org/policies/nominatim/).
3. (Opcional) Si cuentas con una clave de Google Maps Geocoding habilitada para solicitudes desde localhost, añade `VITE_GOOGLE_KEY` al mismo `.env`.

```bash
npm install
npm run dev
```

La aplicación se abrirá en `http://localhost:5173`.

## Uso del componente

El componente principal se encuentra en `src/components/GeoBogota.tsx` y se exporta por defecto. Se puede usar como:

```tsx
import GeoBogota from './components/GeoBogota';

function Example() {
  return <GeoBogota />;
}
```

Si tienes configurada la variable `VITE_GOOGLE_KEY`, también puedes forzar el proveedor a utilizar con la prop `provider="google"`. Si se omite, el componente detecta automáticamente la disponibilidad de Google y cae en Nominatim cuando no existe la clave.

### Características clave

- Autocompletado con debounce (350 ms) y cancelación de solicitudes mediante `AbortController`.
- Restricción geográfica a Bogotá tanto en Nominatim como en Google Places.
- Visualización de la dirección seleccionada y copia al portapapeles de coordenadas con 6 decimales.
- Manejo de errores comunes (red, cuotas, sin resultados) con mensajes descriptivos.

## Uso responsable de Nominatim

- Identifícate siempre con tu correo mediante `VITE_NOMINATIM_EMAIL`.
- Limita las solicitudes: el componente ya aplica debounce y límites de resultados, evita automatizar búsquedas masivas.
- Respeta el límite de un request por segundo desde el mismo cliente.
- Consulta la [documentación oficial](https://nominatim.org/release-docs/latest/) para conocer los términos y cuotas vigentes.

## Scripts disponibles

- `npm run dev`: inicia el servidor de desarrollo de Vite.
- `npm run build`: compila el proyecto para producción.
- `npm run preview`: sirve la build generada.
- `npm run lint`: ejecuta ESLint.

## Notas sobre Google Maps

- Requiere habilitar las APIs de *Places* y *Geocoding*.
- La clave se expone en el cliente; usa restricciones por dominio/origen.
- Google aplica cuotas y costos adicionales. Consulta la [documentación de precios](https://developers.google.com/maps/documentation/geocoding/usage-and-billing).

## Licencias de datos

La información de geocodificación proviene de OpenStreetMap/Nominatim. Atribución requerida: “Datos de geocodificación © OpenStreetMap”.
