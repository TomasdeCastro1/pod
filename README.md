# Comprobantes

App móvil (Expo) y backend (Node.js) para escanear comprobantes firmados y extraer sus datos con IA. Ver `docs/especificacion.md` y `docs/plan/README.md`.

## Arrancar en local

Requiere Node 20+.

```
npm ci
cp server/.env.example server/.env   # completar valores
npm run lint && npm run typecheck && npm test
```

Estructura y convenciones: ver `CLAUDE.md`.
