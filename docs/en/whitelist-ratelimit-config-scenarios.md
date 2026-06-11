# IP Allowlist and Rate Limit Configuration Scenarios

**Project**: flex-rate-limit  
**Date**: 2026-02-05  
**Document type**: configuration scenario guide

## Four Core Questions

### Question 1: The Limiter Is Configured for `/internal`, but the Allowlist Is Not

**Code example**:

```javascript
const internalLimiter = createRateLimiter({ max: 500 });

app.get('/api/internal/stats',
  internalLimiter,
  (req, res) => {
    res.json({ ok: true });
  }
);
```

**Result**:

```text
All IPs can access the route
  -> rate limit applies, 500 requests per minute
  -> under limit: 200 OK
  -> over limit: 429 Too Many Requests
```

**Key logic**:

```javascript
isRouteWhitelisted(route, ip) {
  const whitelist = this.routeWhitelists[route];
  if (!whitelist || whitelist.length === 0) {
    return true; // No route allowlist means all IPs are allowed.
  }
  // ...check configured entries
}
```

**Summary**:

- No allowlist configuration means the route is open to all IPs.
- Every IP can access the route, but every IP is still rate limited.
- This fits public APIs such as `/api/public/data`.

### Question 2: The Allowlist Is Configured for `/internal`, but the Limiter Is Not

**Code example**:

```javascript
const internalWhitelist = ipWhitelistMiddleware('/api/internal');

app.get('/api/internal/stats',
  internalWhitelist,
  (req, res) => {
    res.json({ ok: true });
  }
);
```

**Result**:

```text
Check allowlist
  -> not allowlisted: 403 Forbidden
  -> allowlisted: continue without a rate limit check
  -> 200 OK with no quota protection
```

**Key points**:

- Non-allowlisted IPs receive `403 Forbidden`.
- Allowlisted IPs have unrestricted access because there is no limiter on the route.
- This can be a security and abuse risk.

**Summary**:

- This setup is not recommended.
- Prefer allowlist + rate limiting together.
- A rare exception may be an internal monitoring endpoint where the upstream system already controls volume.

### Question 3: Both Allowlist and Rate Limiting Are Configured for `/internal`

**Recommended code**:

```javascript
const internalWhitelist = ipWhitelistMiddleware('/api/internal');
const internalLimiter = createRateLimiter({ max: 500 });

app.get('/api/internal/stats',
  internalWhitelist,
  internalLimiter,
  (req, res) => {
    res.json({ ok: true });
  }
);
```

**Result**:

```text
Layer 1: allowlist
  -> not allowlisted: 403 Forbidden
  -> allowlisted: continue

Layer 2: rate limiter
  -> under limit: 200 OK
  -> over limit: 429 Too Many Requests
```

| Step | IP Type | Allowlist | Limiter | Result |
|---|---|---|---|---|
| 1 | Not allowlisted | Fails | Not reached | 403 Forbidden |
| 2 | Allowlisted, requests 1-500 | Passes | Under limit | 200 OK |
| 3 | Allowlisted, request 501+ | Passes | Over limit | 429 Too Many Requests |

**Configuration example**:

```json
{
  "routes": {
    "/api/internal": ["10.0.0.0/8", "192.168.0.0/16"]
  }
}
```

```bash
INTERNAL_IP_WHITELIST=10.0.0.0/8,192.168.0.0/16
```

**Summary**:

- This is the recommended setup.
- It provides two layers: access control and rate control.
- The controls remain independent.
- It fits admin consoles, internal APIs, and sensitive operations.

### Question 4: Can the Allowlist Be Global?

Yes. A global allowlist is supported and often useful.

#### Option 1: Global Allowlist for All Routes

```bash
GLOBAL_IP_WHITELIST=127.0.0.1,192.168.1.100,192.168.1.200
```

```json
{
  "global": ["127.0.0.1", "192.168.1.100", "192.168.1.200"]
}
```

```javascript
ipConfig.globalWhitelist = ['127.0.0.1', '192.168.1.100'];
```

**How it works**:

```javascript
isGlobalWhitelisted(ip) {
  if (this.globalWhitelist.length === 0) return true;
  return this.globalWhitelist.includes(ip);
}

if (ipConfig.isGlobalWhitelisted(clientIP)) {
  return next();
}
```

**Effect**:

```text
Global allowlisted IP:
  -> passes allowlist validation for all routes
  -> still goes through each route's rate limiter

Non-global IP:
  -> route-level allowlist is checked
  -> if the route has no allowlist, the route is open
```

#### Option 2: Global Allowlist plus Route Allowlist

```bash
GLOBAL_IP_WHITELIST=127.0.0.1,192.168.1.100
ADMIN_IP_WHITELIST=192.168.1.10,192.168.1.11
INTERNAL_IP_WHITELIST=10.0.0.0/8,192.168.0.0/16
```

Priority:

```text
Global allowlist > route allowlist

If an IP is globally allowlisted:
  -> skip route allowlist validation
  -> continue to rate limiting

If an IP is not globally allowlisted:
  -> check the route allowlist
  -> decide based on the route list
```

#### Scenario Comparison

| Scenario | Global Allowlist | Route Allowlist | Recommended Config |
|---|---|---|---|
| Office network | Employee IPs | None | Global allowlist |
| Admin console | Admin IPs | Extra authorized IPs | Global + route allowlist |
| Internal API | None | Private network ranges | Route allowlist |
| VIP feature | None | VIP customer IPs | Route allowlist |
| Public API | None | None | No allowlist |

## Configuration Decision Tree

```text
Start: I want access control for /api/internal
|
|-- Do I need to restrict IP access?
|   |-- No -> do not configure an allowlist
|   |        -> continue to rate limit decision
|   |
|   |-- Yes
|       |-- All office employees -> global allowlist
|       |-- A specific team or role -> route allowlist
|       |-- Private network ranges -> route allowlist with CIDR
|
|-- Do I need rate limiting?
|   |-- No -> no limiter, not recommended
|   |-- Yes
|       |-- Sensitive write operations -> 10-50 requests/minute
|       |-- Normal reads -> 100-500 requests/minute
|       |-- Monitoring/statistics -> 1000-5000 requests/minute
```

## Complete Configuration Examples

### Example 1: Public API

```javascript
const publicLimiter = createRateLimiter({ max: 100 });

app.get('/api/public/data',
  publicLimiter,
  handler
);
```

Effect:

- Any IP can access the route.
- Every IP is limited to 100 requests per minute.

### Example 2: Admin Console

```bash
ADMIN_IP_WHITELIST=192.168.1.10,192.168.1.11
```

```javascript
const adminWhitelist = ipWhitelistMiddleware('/api/admin');
const adminLimiter = createRateLimiter({ max: 200 });

app.get('/api/admin/users',
  adminWhitelist,
  adminLimiter,
  handler
);
```

Effect:

- Non-allowlisted IPs receive `403 Forbidden`.
- Allowlisted IPs are accepted for requests 1-200.
- Allowlisted IPs receive `429 Too Many Requests` on request 201+.

### Example 3: Internal API

```bash
INTERNAL_IP_WHITELIST=10.0.0.0/8,192.168.0.0/16
```

```javascript
const internalWhitelist = ipWhitelistMiddleware('/api/internal');
const internalLimiter = createRateLimiter({ max: 5000 });

app.get('/api/internal/stats',
  internalWhitelist,
  internalLimiter,
  handler
);
```

Effect:

- External IPs receive `403 Forbidden`.
- Private network IPs are allowed up to 5000 requests per minute.
- Private network IPs receive `429 Too Many Requests` after the quota.

### Example 4: Global Allowlist with Route-Specific Limits

```bash
GLOBAL_IP_WHITELIST=127.0.0.1,192.168.1.100
```

```javascript
app.post('/api/data/delete',
  createRateLimiter({ max: 10 }),
  handler
);

app.get('/api/data/query',
  createRateLimiter({ max: 1000 }),
  handler
);
```

Effect:

- Global allowlisted IPs can access all routes.
- Each operation still has its own rate limit.
- Non-global IPs can access routes without route allowlists.

### Example 5: Mixed Global and Route Allowlists

```bash
GLOBAL_IP_WHITELIST=127.0.0.1,192.168.1.100
ADMIN_IP_WHITELIST=192.168.1.10,192.168.1.11
```

```javascript
const adminWhitelist = ipWhitelistMiddleware('/api/admin');
const adminLimiter = createRateLimiter({ max: 200 });

app.get('/api/admin/users',
  adminWhitelist,
  adminLimiter,
  handler
);
```

Effect:

- Global allowlisted IPs bypass route allowlist validation, then go through rate limiting.
- Route allowlisted IPs pass route validation, then go through rate limiting.
- Other IPs receive `403 Forbidden`.

## Configuration Management

### Environment Variables

```bash
GLOBAL_IP_WHITELIST=127.0.0.1,192.168.1.100,192.168.1.200
ADMIN_IP_WHITELIST=192.168.1.10,192.168.1.11
INTERNAL_IP_WHITELIST=10.0.0.0/8,192.168.0.0/16
VIP_IP_WHITELIST=192.168.1.200,192.168.1.201

node app.js
```

### Configuration File

Create `config/ip-whitelist.json`:

```json
{
  "global": [
    "127.0.0.1",
    "::1",
    "192.168.1.100"
  ],
  "routes": {
    "/api/admin": [
      "192.168.1.10",
      "192.168.1.11"
    ],
    "/api/internal": [
      "10.0.0.0/8",
      "192.168.0.0/16"
    ],
    "/api/vip": [
      "192.168.1.200"
    ]
  }
}
```

### Runtime Management

```bash
curl -X POST http://localhost:3500/api/whitelist/global/add \
  -H "Content-Type: application/json" \
  -d '{"ip":"192.168.1.150"}'

curl -X POST http://localhost:3500/api/whitelist/route/add \
  -H "Content-Type: application/json" \
  -d '{"route":"/api/internal","ip":"192.168.2.100"}'

curl http://localhost:3500/api/whitelist/config
```

## Important Notes

### No Allowlist Means All IPs Are Allowed

```javascript
isRouteWhitelisted('/api/internal', '1.2.3.4');
// returns true when /api/internal has no allowlist
```

Correct practice:

- If you do not need access control, do not use the allowlist middleware.
- If you need access control, configure an explicit IP list.

### Allowlist and Rate Limit Independence

```text
Allowlist pass does not mean unlimited access.
Allowlist pass means the request continues to the limiter.
```

Incorrect understanding:

```text
Allowlisted IP = privileged user = no rate limit
```

Correct understanding:

```text
Allowlisted IP = authorized to access = still rate limited
```

### Global Allowlist Priority

```text
Global allowlist > route allowlist
```

Global allowlisted IPs skip route allowlist validation, but still go through each route's limiter.

### Security Recommendations

| Scenario | Recommended Config | Reason |
|---|---|---|
| Admin console | Allowlist + low rate limit | Two layers of protection |
| Internal API | CIDR allowlist + high rate limit | Private access with abuse protection |
| Public API | No allowlist + medium rate limit | Open access with DDoS mitigation |
| Sensitive operation | Strict allowlist + very low limit | Strongest protection |

## Related Documents

- Full implementation: `examples/express-ip-whitelist-independent.js`
- Comparison guide: [Allowlist and Rate Limit Independence](whitelist-ratelimit-independence.md)
- Dynamic configuration: [Dynamic IP Allowlist Configuration](ip-whitelist-dynamic-config.md)
- Advanced usage: [Advanced Usage](guides/advanced.md)

## Summary

| Question | Answer | Notes |
|---|---|---|
| Limiter configured, no allowlist | All IPs can access and are limited | No allowlist means open |
| Allowlist configured, no limiter | Allowlisted IPs have unlimited access | Not recommended |
| Both configured | Two-layer protection | Recommended |
| Global allowlist | Supported and useful | Combine with route limits |

