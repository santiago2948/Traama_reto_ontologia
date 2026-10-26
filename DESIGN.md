# Diseño de la entrevista

El chat traduce una necesidad de negocio a un requerimiento confirmado. No responde la pregunta. Pregunta solo para cerrar un hueco, propone cuando ya puede armar el pedido, y se detiene cuando el usuario confirma.

El servidor decide la fase. El modelo llena el contenido y, cuando el contrato ya se puede llenar, llama a `registrar_requerimiento`. Si esa llamada no valida, no entra al panel y la fase no avanza.

## Cuándo pregunta, propone y se detiene

**Pregunta** cuando falta un dato que cambia el pedido, y hace una o dos preguntas por turno. Usa las palabras del usuario. Si el usuario ya lo dijo, no lo vuelve a pedir. Si no lo sabe, eso queda en `preguntas_abiertas` y se sigue.

**Propone** cuando la fase ya tiene lo mínimo para mostrar un borrador. La propuesta es el requerimiento del panel, no un párrafo suelto. Las reglas se escriben como hipótesis ("si pasa esto, asociar la salida a rotación"). El agente no afirma porcentajes, causas ni hallazgos. Una cifra que trae el usuario se conserva como formulación suya.

**Se detiene** cuando el usuario confirma. Confirmar no llama al modelo: fija la versión visible. Solo vuelve a hablar si el usuario pide un ajuste, y ese ajuste publica otra versión en borrador.

## Fases

### 1. Delimitar

Hay que dejar escritas tres cosas: la necesidad en una frase, la decisión que ese análisis tiene que soportar, y el alcance (período y al menos una unidad).

Todavía no hay clases ni archivos. Si el primer mensaje ya trae las tres, en ese mismo turno se pasa a proponer.

**Pasa a proponer** cuando existen `necesidad`, `decision_objetivo` y `alcance` con período y una unidad. Si el usuario declara que no conoce el período o la unidad, eso entra en `preguntas_abiertas` y también se avanza.

### 2. Proponer

El agente traduce la necesidad a clases y relaciones, con las palabras del usuario, y registra el requerimiento con `completitud: "faltan_datos"`. Puede incluir hasta tres reglas candidatas. No pide archivos en esta fase.

Si el usuario corrige el esquema, se queda aquí y esa corrección es una versión nueva.

**Pasa a pedir** cuando el usuario acepta el esquema. Aceptar es un sí explícito o un "así está" después de ver la propuesta. Un silencio o un mensaje nuevo que cambia clases no cuenta como aceptación.

### 3. Pedir

Por cada clase o relación que el motor no puede cargar, pregunta dónde vive el dato y qué columnas mínimas hacen falta. Cada fuente es `excel`, `csv`, `pdf` o `crm-export`. Cada fuente y cada columna justifican al menos una clase, una relación o una regla. Lo que no se puede justificar no se pide.

Una ambigüedad que cambia las columnas (motivo en categorías fijas o texto libre) va a `preguntas_abiertas`. No se inventa la columna.

**Pasa a confirmar** cuando toda clase usada en una relación tiene una fuente que la justifica, o está nombrada en una pregunta abierta, y cada regla apunta a columnas ya pedidas o a una pregunta abierta. Recién ahí `completitud` puede ser `suficiente_para_confirmar`. Si el modelo lo declara antes, el servidor lo baja a `faltan_datos` y el turno siguiente pregunta lo que falta.

### 4. Confirmar

El panel muestra la última versión válida. El agente pide un sí o el ajuste, y no abre temas nuevos.

**Se detiene** cuando el usuario aprieta Confirmar. Un ajuste por el chat vuelve a la fase que corresponda (esquema a proponer, archivos a pedir), valida otra versión y deja el pedido en borrador hasta una nueva confirmación.

## Qué no puede hacer el agente

Estas cuatro reglas las hace cumplir el servidor. El prompt las repite, pero si el modelo las rompe el turno no se publica.

**Ninguna cifra sale del modelo.** Puede pedir datos y proponer reglas como hipótesis. No afirma resultados, porcentajes ni hallazgos, y no calcula una causa. Si el usuario trae un número, el requerimiento lo conserva como formulación suya ("el equipo estima en 15%"), sin comprobarlo. Un enunciado con "encontramos", "la causa es" o un porcentaje que el usuario no dijo se rechaza y no entra al panel.

**El requerimiento no es texto libre.** Sale de function calling o Structured Outputs, en la tool `registrar_requerimiento`. El servidor lo valida antes de mostrarlo. Si no valida, esa versión no se renderiza y el agente pide lo que falta. El mensaje del chat puede ser lenguaje natural. El objeto del panel, no.

**La key no sale del servidor.** `OPENAI_API_KEY` se lee solo en la route, desde el entorno. No se importa en `view/`, no se manda al navegador, no se escribe en el repo y no se imprime en logs. El cliente recibe el texto del turno y el requerimiento ya validado.

**El dominio no está fijo.** No hay listas de clases, columnas ni archivos por caso de uso. Nómina, inventario o pedidos no existen en el código: salen de las palabras de esta conversación. La muestra de empaque que se ve en la pantalla es un fixture visual. La entrevista no la usa como catálogo. Si un requerimiento solo cierra para un dominio precargado, no cumple.

Además:

- No pide un archivo o una columna que ninguna clase, relación o regla usa.
- No da la entrevista por cerrada sin aceptación del esquema y sin el mínimo de fuentes, o sin dejar nombrado en una pregunta abierta lo que falta.
- No cambia de fase por su cuenta. La fase la calcula el código a partir del requerimiento validado y de la respuesta del usuario.
