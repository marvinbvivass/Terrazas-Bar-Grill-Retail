# Subir a GitHub — tres comandos

El proyecto ya trae el repositorio de git hecho, con cuatro commits limpios.
Solo falta empujarlo.

## 1 · Crea el repositorio en GitHub

**Vacío**: sin README, sin .gitignore, sin licencia. Si lo creas con archivos,
el push choca con un historial distinto y hay que resolverlo a mano.

## 2 · Descomprime y entra en la carpeta

```bash
cd licoreria-app
```

## 3 · Empuja

```bash
git remote add origin https://github.com/TU-USUARIO/EL-REPO.git
git branch -M main
git push -u origin main
```

Te pedirá usuario y contraseña. **La contraseña es un token de GitHub**, y se
queda en tu máquina. Si no quieres teclearlo cada vez:

```bash
git config --global credential.helper store
```

(en Windows, Git for Windows ya trae el gestor de credenciales y lo recuerda solo)

---

## Qué historial vas a subir

```
719a085  Conectar Firestore como backend, con login y reglas
589a9e8  Preparar despliegue: Firebase Hosting y GitHub Actions
b0e45e7  Cambio de modelo: cuaderno del día, fiado y cierre con dos cifras
7c847da  Base del POS de licorería: dominio, réplica local y caja offline
```

## Si el push se queja del workflow

Si tu token es clásico y no tiene el permiso `workflow`, GitHub rechaza el
push porque el proyecto incluye `.github/workflows/desplegar.yml`. Dos salidas:

- Marcar también el permiso `workflow` al crear el token, o
- Empujar sin el workflow y agregarlo después desde la web de GitHub:

```bash
git rm --cached .github/workflows/desplegar.yml
git commit -m "Quitar workflow temporalmente"
git push -u origin main
```

## Después

Sigue `DESPLIEGUE.md` para Firebase. El orden importa: primero crear la cuenta
de acceso en Authentication, después desplegar.
