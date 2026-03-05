# Backend Development Guide

## Health Endpoints

These endpoints are used for container orchestration probes. They are exempt from rate limiting and request logging.

### `GET /health`

Liveness probe. Always returns `200 OK` regardless of database state.

```json
{ "status": "ok", "uptime": 42.3 }
```

- `uptime`: seconds since process start (`process.uptime()`)
- **No authentication required**
- **Not rate-limited**

### `GET /ready`

Readiness probe. Returns `200` when the database is reachable, `503` when it is not.

**200 OK** — database connected:
```json
{ "status": "ok", "db": "connected" }
```

**200 OK** — database not configured (in-memory mode):
```json
{ "status": "ok", "db": "not configured" }
```

**503 Service Unavailable** — database unreachable:
```json
{ "status": "error", "reason": "<pg error message>" }
```

- **No authentication required**
- **Not rate-limited**

## Middleware Order

Middleware is applied in this order:

1. CORS
2. Helmet (security headers)
3. JSON body parser
4. **Health router** (`/health`, `/ready`) — before rate limiting
5. General rate limiter
6. Request logging (skips health paths)
7. Application routes
