# Subir a GitHub y desplegar en Firebase

Todo lo de aquí se corre **en tu máquina**. Son unos diez minutos la primera
vez y después se despliega solo con cada `git push`.

---

## ⚠️ Dos avisos antes de empezar

**1. Esto reemplaza la aplicación vieja.** El hosting apunta al sitio por
defecto de `ventas-9a210`, así que al desplegar, la aplicación de
`dist-castillo` deja de estar en esa URL. Es lo acordado, pero si todavía hay
alguien usándola, avísale antes.

**2. Las reglas de Firestore son del proyecto entero.** El archivo
`firestore.rules` incluye a propósito un bloque «heredado» con las rutas de la
aplicación vieja (`artifacts/**`, `public_data/**`, `users/**`). Si lo borras y
despliegas, la aplicación vieja se queda sin poder leer ni escribir nada aunque
siga instalada en el teléfono de alguien. Bórralo el día que confirmes que ya
nadie la usa, no antes.

Los datos que ya están en Firestore no se tocan en ningún caso: la licorería
escribe en colecciones nuevas (`ventas`, `abonos`, `productos`…), no en las
viejas.

---

## 1 · Crear la cuenta de acceso

La aplicación ahora pide correo y contraseña, y **no tiene registro abierto** a
propósito: si cualquiera pudiera crearse una cuenta, cualquiera podría ver las
ventas del local y las deudas de los clientes.

En la consola de Firebase → **Authentication** → *Sign-in method*, habilita
**Correo electrónico/contraseña** si no lo está. Después, en la pestaña
**Users** → *Add user*, crea la cuenta del encargado.

Anota esos datos: son los que se usan para entrar.

---

## 2 · Desplegar

```bash
npm install
npm test
npm run build

npm install -g firebase-tools
firebase login
firebase deploy
```

Ese `firebase deploy` sube tres cosas: el sitio, las reglas de Firestore y los
índices. Al terminar te da la URL (`https://ventas-9a210.web.app`).

Si prefieres ir por partes:

```bash
firebase deploy --only firestore:rules   # primero las reglas
firebase deploy --only hosting           # después el sitio
```

---

## 3 · Primera entrada

Abre la URL, entra con la cuenta que creaste, y espera unos segundos.

**No hay catálogo de ejemplo.** El sistema arranca sin ni un producto, a
propósito: nada de datos inventados que después haya que borrar de Firestore.

Lo único que se sube solo es la CONFIGURACIÓN sin la cual nada funciona:
ubicaciones (sala, nevera, depósito), categorías, las cuatro listas de precio y
los métodos de pago. Eso no son datos del negocio, son las piezas del
mecanismo — el motor de precios no puede resolver nada si no existe al menos
una lista.

Los productos los cargas tú desde la pestaña **Catálogo**. Con poner el nombre,
la categoría, el precio de una unidad y lo que te cuesta ya funciona todo: el
precio de mayor y el margen salen solos.

En la barra superior, a la derecha, hay un indicador que dice **Al día**,
**N por subir**, **Subiendo…** o **Sin señal**. Se puede tocar para forzar una
sincronización.

---

## 4 · Subir a GitHub

Crea un repositorio **vacío** en GitHub (sin README ni .gitignore: este
proyecto ya trae los suyos y el historial ya está hecho). Después:

```bash
git remote add origin https://github.com/TU-USUARIO/EL-REPO.git
git branch -M main
git push -u origin main
```

---

## 5 · Que se despliegue solo con cada push

```bash
firebase init hosting:github
```

Crea una cuenta de servicio, la guarda como secreto del repositorio y conecta
las dos cosas. **La credencial nunca pasa por un chat ni por un archivo tuyo.**

Cuando pregunte si sobrescribe el workflow, responde **que no**: el que está en
`.github/workflows/desplegar.yml` corre los tipos y las 86 pruebas antes de
desplegar, y el que genera él no.

Comprueba que el secreto se llame `FIREBASE_SERVICE_ACCOUNT_VENTAS_9A210` en
*Settings → Secrets and variables → Actions*. Si le puso otro nombre, cámbialo
en el workflow.

Desde ahí, cada `git push` a `main` compila, prueba y despliega. Si una prueba
falla, **no despliega**.

---

## Cómo funciona la sincronización

La caja **siempre lee de su copia local**. El servidor nunca está en el camino
de cargar una venta, así que la aplicación responde igual con señal que sin
ella. Lo que viaja hacia arriba es una cola.

Cuando hay señal, en este orden:

1. **Sube** lo que haya en la cola: ventas, cobros.
2. **Baja** el catálogo, los clientes y el movimiento de los últimos 90 días.

El orden importa. Al revés, una bajada podría pisar el stock local con el
remoto antes de que las ventas de este equipo lleguen arriba, y la mercancía ya
vendida reaparecería en el anaquel.

**Reintentar es seguro.** El id de cada venta lo genera la caja, y la subida va
dentro de una transacción que primero mira si ese documento ya existe. Si
existe, no vuelve a descontar stock. Sin ese chequeo, un reenvío descontaría la
mercancía dos veces.

---

## Lo que todavía no está probado

Firebase está bloqueado desde el entorno donde se escribió este código, así que
**la conexión con Firestore no se ha ejecutado nunca contra el servidor real**.
La lógica de negocio sí (86 pruebas), y la aplicación se probó completa contra
la copia local, pero estas cuatro cosas hay que verlas funcionar la primera vez:

- Que las reglas dejen leer y escribir con la sesión iniciada.
- Que la configuración inicial suba sin quedarse a medias.
- Que un producto creado en la caja llegue a Firestore con sus presentaciones,
  códigos y precios completos.
- Que una venta suba y descuente stock **una sola vez**.
- Que un segundo dispositivo vea lo cargado en el primero.

Si algo falla, el indicador de la barra pasa a **Falló al subir** y el detalle
del error sale al pasarle el ratón por encima. Nada se pierde: lo que no sube
se queda en la cola.

---

## Probar antes de desplegar

Si quieres ver la caja funcionando ya, sin haber tocado Firebase:

```bash
npm run dev
```

En la pantalla de acceso sale un botón **Probar sin Firebase**. Trabaja contra
tu equipo y no sincroniza nada. Ese botón **solo existe en modo desarrollo**:
`npm run build` lo elimina del código, así que no queda ninguna puerta abierta
en el sitio publicado. Hay una comprobación de eso en el flujo de despliegue.

---

## Pendiente de decidir

- **¿Hasta cuándo se puede editar un día ya cerrado?** Hoy se puede volver a
  cualquier fecha y seguir cargando. Si el dueño revisa el cierre del lunes y
  después alguien agrega una venta a ese lunes, el número que vio deja de ser
  el número.
- **Los iconos de `public/` son marcadores de sitio.** Hay que reemplazarlos
  por el arte real antes de instalar la aplicación en la caja.
- **El bloque heredado de `firestore.rules`**, cuando se confirme que la
  aplicación vieja ya no se usa.
