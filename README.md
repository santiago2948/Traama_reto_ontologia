# Trama — entrevista de requerimiento

Chat de entrada de Trama. Una persona escribe una necesidad de negocio en lenguaje natural y la entrevista la convierte en un requerimiento formal: qué decisión hay que soportar, qué conceptos y relaciones mirar, qué reglas quedan como hipótesis y qué archivos hacen falta para cargarlas.

El modelo de lenguaje conduce la conversación. No calcula la respuesta ni inventa cifras. El 15% de “se nos cayó la productividad un 15%” queda como lo formuló quien pregunta. Comprobarlo, y decir si se debe a paradas o a ausentismo, corresponde a un paso posterior: cargar esos datos y pasarlos por un motor de reglas. Este proyecto termina cuando el requerimiento queda confirmado.

## Cómo está pensado

La entrevista tiene cuatro momentos. El código decide cuándo se pasa de uno a otro.

1. **Delimitar.** Dejar la necesidad en una frase, la decisión que hay que tomar y el alcance (período y unidades).
2. **Proponer.** Traducir eso a clases y relaciones, con reglas candidatas escritas como condición (“si pasa esto, asociar la baja a paradas”).
3. **Pedir.** Pedir solo los archivos y las columnas que justifican una clase, una relación o una regla.
4. **Confirmar.** El panel muestra el pedido. Confirmar lo fija. Un ajuste por el chat publica otra versión.

El código está partido en MVC. La vista no decide qué pasa con un mensaje, y el modelo no conoce React.

```text
model/        requerimiento y entrevista. Funciones puras, sin React.
controller/   une la pantalla con el modelo. Más adelante, la route de OpenAI entra acá.
view/         chat, panel y componentes de shadcn. Solo dibuja lo que recibe.
app/          la página, que monta el controlador.
```

OpenAI, cuando se conecte, queda detrás de una interfaz que usa el controlador. La key vive solo en el servidor.

## Esta versión

Hoy el repositorio es el cascarón visual, ya ordenado en MVC. No hay llamada a un modelo de lenguaje, ni validación del contrato, ni guardado. La conversación y el requerimiento de la columna derecha son una muestra fija, el caso de productividad en empaque, para ver la interfaz con contenido real. Enviar y confirmar pasan por `model/interview.ts`; la vista solo recibe el resultado.

Lo que sí funciona en pantalla:

- Layout de Trama: header, chat sobre el fondo de sidebar y panel del requerimiento.
- Composer: Enter envía, Shift+Enter hace un salto de línea. El mensaje nuevo queda en el hilo, solo en el navegador.
- Confirmar cambia el estado del pedido. El borde punteado es borrador; el borde sólido y el mayor peso de fuente es confirmado. El estado no depende de un color.
- Modo claro y oscuro, con los tokens en `oklch`.

## Estilos

Next.js (App Router), TypeScript, Tailwind v4 y shadcn/ui con estilo `radix-nova` y base `neutral`. La fuente es Geist, cargada con `next/font/google`.

Los tokens pedidos para la app están en `app/globals.css`:

```css
:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --sidebar: oklch(0.985 0 0);
  --destructive: oklch(0.577 0.245 27.325);
}
```

El modo oscuro usa los valores correspondientes del mismo archivo. shadcn necesita alias extra (`card-foreground`, `accent`, `popover`, variables de sidebar). Esos alias siguen la misma escala de grises.

La interfaz sigue la referencia de la app:

| Pieza | Tratamiento |
| --- | --- |
| Header | `h-14 border-b px-6`. “Trama” en `text-sm font-semibold` y la etiqueta `ENTREVISTA` en `text-xs tracking-wide`. |
| Columnas | Separadas con `divide-x`. Chat en `bg-sidebar`. Panel en `bg-background`, encabezado `border-b px-6 py-4`. |
| Mensajes | Ancho completo, a la izquierda, `rounded-md border p-2 text-sm`. Agente con `bg-muted`. Usuario con `border-foreground/20`. Etiqueta “Agente” o “Vos”. |
| Composer | Textarea `min-h-16 rounded-lg` y botón “Enviar”. |
| Cards | `rounded-xl ring-1 ring-foreground/10`, padding de 16px, sin sombra. |

## Cómo correrlo

```bash
npm install
npm run dev
```

Abrí `http://localhost:3000`.

## Qué sigue

La entrevista de verdad: el contrato `RequerimientoMotor` validado con Zod, la tool `registrar_requerimiento`, las fases en código, la route de servidor con `OPENAI_API_KEY` y el tope de uso antes de desplegar en Vercel. El panel de esta vista es el lugar donde ese objeto va a reemplazar a la muestra.
