# Trama — entrevista de requerimiento

Chat de entrada de Trama. Una persona describe una necesidad de negocio en lenguaje natural y la entrevista la convierte en un requerimiento tipado: decisión a soportar, clases y relaciones, reglas candidatas (como hipótesis) y las fuentes mínimas que harían falta para cargar el grafo y correr el motor de inferencia.

El LLM orquesta la conversación. No calcula la causa, no inventa cifras ni hallazgos. Si alguien dice “bajó un 15%”, eso queda como su formulación. Comprobarlo corresponde a un paso posterior (carga de datos + motor). Este proyecto termina cuando el requerimiento queda confirmado en el panel.

## Criterio central: qué datos pedir

Trama no trae un catálogo fijo por dominio. Tampoco le pregunta al usuario “¿qué archivos tenés?”.

A partir de la necesidad delimitada y del esquema propuesto, el agente **deduce el mínimo de fuentes y columnas** que el motor necesitaría para verificar las relaciones y reglas candidatas. Cada fuente y cada columna se justifican contra una clase, una relación o una regla. Si no se puede justificar, no se pide.

El usuario revisa ese pedido en el panel: confirma, o pide un ajuste por el chat (nombre de archivo, formato, columnas). Un ajuste publica otra versión.

## Flujo de la entrevista

El código decide la fase. El modelo llena el contenido y, cuando corresponde, llama a `registrar_requerimiento`. Si la llamada no valida con Zod, no entra al panel.

1. **Delimitar.** Necesidad en una frase, decisión objetivo y alcance (período + al menos una unidad). Una o dos preguntas por turno, solo si falta algo.
2. **Proponer.** Clases, relaciones y hasta tres reglas candidatas, en el vocabulario del usuario. Todavía sin fuentes.
3. **Pedir.** Con el esquema aceptado, el agente **lista** las fuentes y columnas mínimas derivadas del modelo (tipos: `excel`, `csv`, `pdf`, `crm-export`). No inventaria el archivo real de la empresa: declara qué haría falta. Ambigüedades van a `preguntas_abiertas`.
4. **Confirmar.** El panel muestra la versión. Confirmar la fija. Un ajuste vuelve a borrador con una versión nueva.

Detalle de cuándo pregunta, propone y se detiene: [`DESIGN.md`](./DESIGN.md).

## Arquitectura

```text
model/        entrevista, contrato, prompt, validación Zod, interfaz LlmClient
controller/   pantalla, hook del cliente, implementación OpenAI (server-only)
view/         chat, panel del requerimiento, shadcn
app/          página y Route Handler POST /api/chat
```

La lógica de fases vive en `model/interview.ts`. OpenAI queda detrás de `LlmClient`; se puede cambiar de proveedor sin tocar la entrevista. La key (`OPENAI_API_KEY`) se lee solo en el servidor.

## Qué hay hoy

- Chat + panel lado a lado, con estilos de Trama (tokens oklch, Geist, claro/oscuro).
- Entrevista guiada por fases con system prompt.
- Tool `registrar_requerimiento` + validación en servidor (forma del contrato + justificación de fuentes + rechazo de enunciados que afirman hallazgos).
- Versiones del requerimiento; Confirmar / Ajustar en el panel.
- Tope blando de abuso en la API (cantidad y largo de mensajes por request).
- Estado en el cliente (sin base de datos).

## Estilos

Next.js (App Router), TypeScript, Tailwind v4 y shadcn/ui (`radix-nova`, base `neutral`). Tokens en `app/globals.css`. Estados por borde sólido/punteado y peso tipográfico, no por color.

## Cómo correrlo

```bash
npm install
```

Copiá `.env.example` a `.env` (no se commitea) y completá la key:

```bash
OPENAI_API_KEY=sk-...
# opcional
OPENAI_MODEL=gpt-4.1-mini
```

```bash
npm run dev
```

Abrí `http://localhost:3000`.

## Despliegue en Vercel

1. Subí el repo a GitHub (este proyecto ya apunta a `origin`).
2. En [vercel.com/new](https://vercel.com/new) importá el repositorio. Framework: **Next.js** (autodetectado). Sin build command custom.
3. En **Environment Variables** agregá (Production + Preview):
   - `OPENAI_API_KEY` — obligatoria
   - `OPENAI_MODEL` — opcional (`gpt-4.1-mini` por defecto)
4. Deploy. La API `/api/chat` corre en Node con `maxDuration = 60` (Hobby permite hasta 60s).

CLI (alternativa):

```bash
npx vercel
npx vercel env add OPENAI_API_KEY
npx vercel --prod
```

Sin la key en el entorno de Vercel, el chat responde error de servidor.

## Decisiones

| Decisión | Por qué | Alternativa descartada |
| --- | --- | --- |
| Fases en código, no solo en el prompt | El servidor controla el avance; el modelo no “decide” la fase | Dejar que el LLM cambie de fase solo |
| Function calling + Zod | Salida tipada y rechazable antes del panel | Pedir JSON libre en el mensaje |
| Fuentes derivadas del esquema | El corazón del reto es *qué* datos hacen falta y por qué | Preguntar al usuario qué archivos ya tiene |
| Interfaz `LlmClient` | Cambiar proveedor sin tocar la entrevista | Llamar OpenAI desde la UI o desde el modelo |
| Key solo en route | Cumple la regla no negociable del reto | Cualquier uso en el cliente |

## Limitaciones conocidas

- Todavía no hay tests automatizados.
- La protección anti-abuso es mínima (límites por request); falta contraseña o rate limit por sesión/IP.
- Un refresh pierde el hilo (no hay `localStorage`).
- La calidad de las fuentes propuestas depende del modelo; el usuario debe poder corregir nombres y columnas.
- Sin streaming de respuestas.
- En Hobby, un turno con varias llamadas al modelo puede acercarse al tope de 60s.

## Qué haríamos después

1. Conectar el requerimiento confirmado a una carga de archivos (mapeo columna → clase/relación).
2. Materializar el grafo y pasar las reglas candidatas al motor de inferencia.
3. Devolver contradicciones y relaciones encontradas sin que el LLM invente cifras.
4. Tests con LLM simulado.

## Entrega del reto

- Repo: este proyecto en GitHub.
- `DESIGN.md`: diseño de la entrevista.
- Despliegue: ver sección Vercel arriba.
- Pendiente de cierre: URL pública, tres transcripciones con su requerimiento, video/GIF corto.
