# Allowlist and Rate Limit Independence

## Core Problem

The allowlist and rate limiting must be two completely independent controls, not a coupled shortcut.

- **Allowlist**: access control. If an IP is not allowed, return `403 Forbidden`.
- **Rate limiting**: request-rate control. If a request exceeds the quota, return `429 Too Many Requests`.
- **Independence**: even when an IP is allowed, it still goes through rate limiting.

## Quick Reference: Configuration Scenarios

### Scenario Matrix

| Configuration | Result | Recommendation |
|---|---|---|
| Only rate limiting | All IPs can access, but requests are rate limited | Good for public APIs |
| Only allowlist | Allowlisted IPs can access without a quota | Not recommended |
| Allowlist + rate limiting | Allowlist check, then rate limit check | Recommended |
| Global allowlist | Shared across routes, then each route keeps its own limit | Recommended |

Detailed behavior is documented in [IP Allowlist Configuration Scenarios](whitelist-ratelimit-config-scenarios.md).

### Key Points

1. No allowlist configuration means all IPs are allowed, not all IPs are denied.
2. Allowlisted IPs are still rate limited in the independent design.
3. The global allowlist has higher priority than route-level allowlists, but it does not bypass rate limiting.
4. The recommended setup for sensitive endpoints is allowlist + rate limiting.

## Incorrect Coupled Implementation

### Problem Code

Earlier advanced examples mixed allowlist checks into the limiter's `skip` callback:

```javascript
function createRouteLimiter(route, options = {}) {
  return new RateLimiter({
    windowMs: options.windowMs || 60 * 1000,
    max: options.max || 50,
    skip: (req) => {
      const clientIP = req.ip || req.socket?.remoteAddress;

      // Problem: allowlisted IPs skip the limiter entirely.
      if (ipConfig.isGlobalWhitelisted(clientIP)) {
        return true;
      }

      if (ipConfig.isRouteWhitelisted(route, clientIP)) {
        return true;
      }

      return false;
    },
  });
}
```

### Why This Is Wrong

| Problem | Description | Consequence |
|---|---|---|
| Coupling | Allowlist checks live inside the limiter | The two controls cannot be configured independently |
| Limit bypass | Allowlisted IPs return `skip: true` | Allowlisted IPs are not rate limited |
| Confused behavior | One option controls two separate concerns | Users cannot reason about authorization and quota separately |

### Actual Coupled Behavior

```text
Allowlisted IP:
  -> skip: true -> rate limit is fully bypassed
  -> unlimited access

Non-allowlisted IP:
  -> skip: false -> limiter applies
  -> request is rate limited
```

The conclusion is simple: allowlisted IPs are not limited, so the controls are coupled.

## Correct Independent Implementation

### Core Principle

```text
Request -> [Allowlist middleware] -> [Rate limit middleware] -> [Business handler]
              | denied                 | over quota
              v                        v
        403 Forbidden             429 Too Many Requests
```

Use two independent middleware functions:

1. The allowlist middleware only verifies the IP.
2. The rate-limit middleware only controls request rate.

### 1. Independent Allowlist Middleware

```javascript
function ipWhitelistMiddleware(route) {
  return (req, res, next) => {
    const clientIP = req.ip || req.socket?.remoteAddress;

    if (ipConfig.isGlobalWhitelisted(clientIP)) {
      return next();
    }

    if (ipConfig.isRouteWhitelisted(route, clientIP)) {
      return next();
    }

    res.status(403).json({
      error: 'Access denied',
      message: 'Only authorized IP addresses may access this resource',
      ip: clientIP,
    });
  };
}
```

### 2. Independent Rate Limit Middleware

```javascript
function createRateLimiter(options = {}) {
  const limiter = new RateLimiter({
    windowMs: options.windowMs || 60 * 1000,
    max: options.max || 100,
  });

  return limiter.middleware();
}
```

The limiter does not inspect the allowlist. All requests that pass authorization are counted.

### 3. Compose Both Middleware Layers

```javascript
const adminWhitelist = ipWhitelistMiddleware('/api/admin');
const adminLimiter = createRateLimiter({ max: 200 });

app.get('/api/admin/users',
  adminWhitelist,
  adminLimiter,
  (req, res) => {
    res.json({ users: [] });
  }
);
```

### Actual Independent Behavior

```text
Allowlisted IP, requests 1-200:
  -> allowlist passes -> limiter passes -> 200 OK

Allowlisted IP, request 201+:
  -> allowlist passes -> limiter blocks -> 429 Too Many Requests

Non-allowlisted IP:
  -> allowlist rejects -> 403 Forbidden
```

The allowlist only decides whether the IP may enter. It never grants unlimited quota.

## Comparison Table

| Feature | Coupled Version | Independent Version |
|---|---|---|
| Are allowlisted IPs limited? | No, `skip: true` bypasses limits | Yes, limits still apply |
| Execution order | Allowlist is hidden inside the limiter | Allowlist, then limiter |
| Configuration independence | Low | High |
| Behavior clarity | Ambiguous | Clear |
| Testability | Harder | Easier |

## Test Verification

### Test 1: Allowlisted IP Is Still Limited

```bash
for i in {1..6}; do
  curl http://localhost:3500/api/test/independence
  echo ""
done
```

Expected independent result when the limit is 5 requests per minute:

```text
Request 1: 200 OK - {"remaining":4}
Request 2: 200 OK - {"remaining":3}
Request 3: 200 OK - {"remaining":2}
Request 4: 200 OK - {"remaining":1}
Request 5: 200 OK - {"remaining":0}
Request 6: 429 Too Many Requests
```

Incorrect coupled result:

```text
Requests 1-6: all 200 OK
```

### Test 2: Non-Allowlisted IP Is Rejected

```bash
curl http://localhost:3500/api/admin/users
```

Expected result:

```json
{
  "error": "Access denied",
  "message": "Only authorized IP addresses may access this resource"
}
```

## File Comparison

| Type | File | Behavior | Recommended |
|---|---|---|---|
| Coupled | `express-ip-whitelist-advanced.js` | Allowlisted IPs bypass limits | No |
| Coupled | `koa-ip-whitelist-advanced.js` | Allowlisted IPs bypass limits | No |
| Independent | `express-ip-whitelist-independent.js` | Allowlist and limiter are separate | Yes |
| Independent | `koa-ip-whitelist-independent.js` | Allowlist and limiter are separate | Yes |

## Usage Recommendations

### Public API

All users can access the route, but the route is rate limited.

```javascript
app.get('/api/public/data',
  createRateLimiter({ max: 100 }),
  handler
);
```

### Admin Console

Only office/admin IPs may access the route, and those IPs are still limited.

```javascript
app.get('/api/admin/users',
  ipWhitelistMiddleware('/api/admin'),
  createRateLimiter({ max: 200 }),
  handler
);
```

### Internal API

Only private network ranges may access the route, with a higher quota.

```javascript
app.get('/api/internal/stats',
  ipWhitelistMiddleware('/api/internal'),
  createRateLimiter({ max: 5000 }),
  handler
);
```

### Different Operations with Different Limits

```javascript
app.post('/api/secure/delete',
  ipWhitelistMiddleware('/api/secure'),
  createRateLimiter({ max: 10 }),
  handler
);

app.get('/api/secure/query',
  ipWhitelistMiddleware('/api/secure'),
  createRateLimiter({ max: 1000 }),
  handler
);
```

## Quick Start

### Express Independent Example

```bash
cd flex-rate-limit

GLOBAL_IP_WHITELIST=127.0.0.1 \
ADMIN_IP_WHITELIST=192.168.1.10,192.168.1.11 \
node examples/express-ip-whitelist-independent.js

for i in {1..6}; do
  curl http://localhost:3500/api/test/independence
  echo ""
done
```

### Koa Independent Example

```bash
PORT=3501 GLOBAL_IP_WHITELIST=127.0.0.1 \
node examples/koa-ip-whitelist-independent.js

for i in {1..6}; do
  curl http://localhost:3501/api/test/independence
  echo ""
done
```

## Related Documents

- Express independent example: `examples/express-ip-whitelist-independent.js`
- Koa independent example: `examples/koa-ip-whitelist-independent.js`
- Coupled examples for comparison: `examples/express-ip-whitelist-advanced.js`
- Configuration scenarios: [IP Allowlist Configuration Scenarios](whitelist-ratelimit-config-scenarios.md)
- Dynamic configuration: [Dynamic IP Allowlist Configuration](ip-whitelist-dynamic-config.md)

## Summary

| Aspect | Coupled Version | Independent Version |
|---|---|---|
| Allowlisted IP quota | Unlimited | Rate limited |
| Implementation | One middleware with `skip` | Two independent middleware layers |
| Flexibility | Low | High |
| Clarity | Confusing | Clear |
| Recommendation | Avoid | Use |

Key points:

1. The allowlist middleware only verifies IP access.
2. The limiter middleware only controls request rate.
3. Allowlisted IPs are still rate limited.
4. The execution order is allowlist, then rate limiter, then business handler.

