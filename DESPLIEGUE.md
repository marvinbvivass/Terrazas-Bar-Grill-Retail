# Subir a GitHub y desplegar en Firebase

Todo lo de aquí se corre **en tu máquina**, desde la carpeta del proyecto. Son
cinco minutos la primera vez y después se despliega solo con cada `git push`.

---

## ⚠️ Antes de nada: no pises la aplicación vieja

El proyecto de Firebase `ventas-9a210` ya tiene desplegada la aplicación de
`dist-castillo`. Si despliegas sobre el sitio por defecto, **la reemplazas**, y
si todavía hay alguien usándola se queda sin sistema.

Por eso la configuración apunta a un **sitio nuevo dentro del mismo proyecto**,
no al de siempre. Los datos de Firestore no se tocan en ninguno de los dos
casos: esta aplicación todavía no usa Firestore, guarda todo en el navegador.

---

## 1 · Crear el sitio de hosting

```bash
npm install -g firebase-tools
firebase login
firebase hosting:sites:create licoreria-castillo
```

Si ese nombre está tomado, elige otro. La URL queda
`https://EL-NOMBRE-QUE-ELIJAS.web.app`.

Después abre `.firebaserc` y reemplaza `CAMBIAR-POR-EL-ID-DEL-SITIO` por ese
mismo nombre:

```json
"licoreria": ["licoreria-castillo"]
```

Y enlaza el destino:

```bash
firebase target:apply hosting licoreria licoreria-castillo
```

---

## 2 · Primer despliegue a mano

```bash
npm install
npm test
npm run build
firebase deploy --only hosting:licoreria
```

Al terminar te da la URL. Ábrela en el teléfono y en la computadora del local:
la aplicación funciona completa, sin conexión incluida.

---

## 3 · Subir a GitHub

Crea un repositorio **vacío** en GitHub (sin README ni .gitignore, porque este
proyecto ya trae los suyos y el historial ya está hecho). Después:

```bash
git remote add origin https://github.com/TU-USUARIO/EL-REPO.git
git branch -M main
git push -u origin main
```

Te va a pedir usuario y contraseña: la contraseña es un token personal de
GitHub, y **se queda en tu máquina**. No hace falta que me lo pases.

---

## 4 · Que se despliegue solo con cada push

```bash
firebase init hosting:github
```

Este comando hace tres cosas por su cuenta: crea una cuenta de servicio en
Google, guarda su credencial como secreto del repositorio en GitHub, y conecta
los dos. **La credencial nunca pasa por un chat ni por un archivo tuyo.**

Cuando pregunte si quiere sobrescribir el workflow, responde **que no**: el que
está en `.github/workflows/desplegar.yml` ya corre los tipos y las 80 pruebas
antes de desplegar, y el que genera él no.

Comprueba que el secreto se llame exactamente
`FIREBASE_SERVICE_ACCOUNT_VENTAS_9A210` en *Settings → Secrets and variables →
Actions*. Si le puso otro nombre, cámbialo en el workflow.

Desde ahí, cada `git push` a `main` compila, corre las pruebas y despliega. Si
una prueba falla, **no despliega**, que es justo lo que queremos.

---

## Qué vas a poder probar, y qué no

**Sí funciona hoy, en cualquier dispositivo con la URL:**

- Cargar el cuaderno de cualquier día, de contado o fiado
- Precios por frío, al tiempo y mayoreo
- Pago mixto multimoneda con IGTF
- Cuentas de clientes y abonos parciales
- El cierre con sus dos cifras
- Sin conexión: se sigue cargando y todo queda guardado

**Todavía no:**

- **Los datos NO se comparten entre dispositivos.** Cada navegador tiene su
  propia copia en IndexedDB. Si cargas el cuaderno en la computadora del local
  y abres la URL en tu teléfono, el teléfono aparece vacío. Para eso hace falta
  el backend, y es la siguiente decisión que hay que tomar (ver abajo).
- Borrar los datos del navegador borra lo cargado. Mientras no haya backend,
  **una sola máquina es la buena** y conviene que sea siempre la misma.

---

## La decisión que sigue: dónde viven los datos

Ahora mismo la aplicación no tiene backend. Hay dos caminos y conviene elegir
antes de que haya datos de verdad que migrar:

**Firestore**, en el mismo proyecto `ventas-9a210`. Ventaja: ya lo tienes, la
sincronización entre dispositivos sale casi gratis y el trabajo sin conexión
también. Desventaja: los reportes de margen, rotación y kardex hay que
construirlos a mano documento por documento, y el motor de precios no se puede
revalidar del lado del servidor.

**PostgreSQL** (Supabase), que es lo que dice el plano y lo que ya está
modelado en `esquema_licoreria.sql`. Ventaja: los reportes son consultas,
`resolver_precio()` ya existe y revalida lo que calcula la caja. Desventaja: un
proveedor más y la sincronización sin conexión hay que escribirla, aunque con
40 productos es la cola que ya está en `src/data/sync.ts`.

El contrato que hay que implementar es el mismo en los dos casos y son tres
funciones (`src/data/sync.ts`), así que la decisión es reversible sin tocar ni
el dominio ni la interfaz.
