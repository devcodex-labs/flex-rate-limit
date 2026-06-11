# Dynamic IP Allowlist Configuration

## Important: Understand the Configuration Scenarios First

Before using dynamic allowlist configuration, understand how the allowlist and the limiter interact.

### Four Core Questions

#### 1. Only Rate Limiting, No Allowlist

Question: if `/internal` has a limiter but no allowlist, what happens?

Answer: all IPs can access the route, and all requests are rate limited.

```javascript
app.get('/api/internal/stats',
  createRateLimiter({ max: 500 }),
  handler
);
```

Effect: no allowlist means all IPs are allowed, but they still pass through the limiter.

#### 2. Only Allowlist, No Rate Limiting

Question: if `/internal` has an allowlist but no limiter, what happens?

Answer: non-allowlisted IPs receive `403 Forbidden`; allowlisted IPs have unlimited access. This is not recommended.

```javascript
app.get('/api/internal/stats',
  ipWhitelistMiddleware('/api/internal'),
  handler
);
```

Effect:

- Non-allowlisted IP -> `403 Forbidden`
- Allowlisted IP -> unrestricted access because there is no limiter

#### 3. Both Allowlist and Rate Limiting

Question: if `/internal` has both an allowlist and a limiter, what happens?

Answer: this is the recommended two-layer setup.

```javascript
app.get('/api/internal/stats',
  ipWhitelistMiddleware('/api/internal'),
  createRateLimiter({ max: 500 }),
  handler
);
```

Effect:

- Non-allowlisted IP -> `403 Forbidden`
- Allowlisted IP, requests 1-500 -> `200 OK`
- Allowlisted IP, request 501+ -> `429 Too Many Requests`

#### 4. Global Allowlist

Question: can an allowlist be global?

Answer: yes, and it is often useful.

```bash
GLOBAL_IP_WHITELIST=127.0.0.1,192.168.1.100
```

Effect:

- Globally allowlisted IPs can pass allowlist validation on every route.
- They still go through each route's rate limit.

Priority: global allowlist > route allowlist.

See [IP Allowlist Configuration Scenarios](whitelist-ratelimit-config-scenarios.md) for the full matrix.

## Quick Start

### Express

```bash
cd flex-rate-limit

GLOBAL_IP_WHITELIST=127.0.0.1 \
ADMIN_IP_WHITELIST=192.168.1.10,192.168.1.11 \
node examples/express-ip-whitelist-advanced.js

curl http://localhost:3400/api/whitelist/config
curl http://localhost:3400/api/public/data
curl http://localhost:3400/api/admin/users
```

### Koa

```bash
npm install @koa/router koa-bodyparser

PORT=3401 \
GLOBAL_IP_WHITELIST=127.0.0.1 \
node examples/koa-ip-whitelist-advanced.js

curl http://localhost:3401/api/whitelist/config
curl http://localhost:3401/api/public/data
```

### Egg.js

See `examples/egg-ip-whitelist-advanced.js` for a full Egg.js project-style example.

## Configuration Methods

### Method 1: Environment Variables

This is usually the best production option because it keeps runtime configuration outside source files.

```bash
export GLOBAL_IP_WHITELIST="127.0.0.1,192.168.1.1,192.168.1.2"
export ADMIN_IP_WHITELIST="192.168.1.10,192.168.1.11"
export INTERNAL_IP_WHITELIST="10.0.0.0/8,192.168.0.0/16"
export VIP_IP_WHITELIST="192.168.1.200,192.168.1.201"

node app.js
```

### Method 2: Configuration File

Create `config/ip-whitelist.json`:

```json
{
  "global": [
    "127.0.0.1",
    "::1"
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

The application can load this file automatically when it exists.

### Method 3: Code Configuration

```javascript
const ipConfig = new IPWhitelistConfig();

ipConfig.globalWhitelist = ['127.0.0.1', '192.168.1.1'];
ipConfig.routeWhitelists = {
  '/api/admin': ['192.168.1.10'],
};
```

## Runtime Management API

### View Current Configuration

```bash
curl http://localhost:3400/api/whitelist/config
```

Response:

```json
{
  "global": ["127.0.0.1", "::1"],
  "routes": {
    "/api/admin": ["192.168.1.10", "192.168.1.11"],
    "/api/internal": ["10.0.0.0/8", "192.168.0.0/16"]
  }
}
```

### Add a Global Allowlist Entry

```bash
curl -X POST http://localhost:3400/api/whitelist/global/add \
  -H "Content-Type: application/json" \
  -d '{"ip":"192.168.1.100"}'
```

Response:

```json
{
  "message": "added",
  "ip": "192.168.1.100"
}
```

### Remove a Global Allowlist Entry

```bash
curl -X POST http://localhost:3400/api/whitelist/global/remove \
  -H "Content-Type: application/json" \
  -d '{"ip":"192.168.1.100"}'
```

### Add a Route Allowlist Entry

```bash
curl -X POST http://localhost:3400/api/whitelist/route/add \
  -H "Content-Type: application/json" \
  -d '{"route":"/api/admin","ip":"192.168.1.12"}'
```

## Usage Scenarios

### Scenario 1: Admin Console Only Allows Office IPs

```bash
ADMIN_IP_WHITELIST="192.168.1.10,192.168.1.11,192.168.1.12"
```

```json
{
  "routes": {
    "/api/admin": ["192.168.1.10", "192.168.1.11", "192.168.1.12"]
  }
}
```

Effect:

- Allowlisted IPs can access the admin route.
- Other IPs receive `403 Forbidden`.
- Add a limiter on the same route when you also need quota protection.

### Scenario 2: Internal API Allows Private Networks

```bash
INTERNAL_IP_WHITELIST="10.0.0.0/8,192.168.0.0/16,172.16.0.0/12"
```

Effect:

- Private addresses such as `10.x.x.x`, `192.168.x.x`, and `172.16-31.x.x` can access.
- External IPs receive `403 Forbidden`.

### Scenario 3: Temporarily Authorize a Test IP

```bash
curl -X POST http://localhost:3400/api/whitelist/global/add \
  -d '{"ip":"203.0.113.100"}'

curl -X POST http://localhost:3400/api/whitelist/global/remove \
  -d '{"ip":"203.0.113.100"}'
```

### Scenario 4: Give VIP Customers Higher Limits

```javascript
const vipLimiter = new RateLimiter({
  max: (req) => {
    const isVIP = ipConfig.isRouteWhitelisted('/api/vip', req.ip);
    return isVIP ? 5000 : 100;
  },
});
```

This is dynamic quota selection, not an allowlist bypass. VIP requests are still limited.

## Security Recommendations

### Protect Management APIs

```javascript
app.post('/api/whitelist/global/add',
  authMiddleware,
  handler
);
```

Management endpoints must require administrator authentication.

### Protect Configuration Files

```bash
chmod 400 config/ip-whitelist.json
chown app:app config/ip-whitelist.json
```

### Protect Environment Variables

```bash
echo ".env" >> .gitignore
```

Use your platform's secret or configuration mechanism where appropriate, such as Kubernetes Secrets, AWS Secrets Manager, or deployment-time environment variables.

### Review Regularly

Review allowlist entries at least monthly and remove IPs that are no longer needed.

## Related Documents

- Configuration scenarios: [IP Allowlist Configuration Scenarios](whitelist-ratelimit-config-scenarios.md)
- Independence model: [Allowlist and Rate Limit Independence](whitelist-ratelimit-independence.md)
- Advanced usage: [Advanced Usage](guides/advanced.md)
- Basic example: `examples/ip-whitelist-example.js`
- Express advanced example: `examples/express-ip-whitelist-advanced.js`
- Koa advanced example: `examples/koa-ip-whitelist-advanced.js`
- Egg.js advanced example: `examples/egg-ip-whitelist-advanced.js`

## FAQ

### What is the priority between global and route allowlists?

The global allowlist has higher priority. If an IP is globally allowlisted, it passes allowlist validation for every route.

### How do I test whether the allowlist works?

```bash
curl http://localhost:3400/api/whitelist/config
curl -v http://localhost:3400/api/admin/users
```

If the IP is not allowlisted, the route should return `403 Forbidden`.

### Is IPv6 supported?

Yes. Configure IPv6 addresses the same way:

```json
{
  "global": ["::1", "2001:db8::1"]
}
```

### How do I use CIDR notation?

```bash
192.168.1.0/24  # 192.168.1.0 - 192.168.1.255
192.168.0.0/16  # 192.168.0.0 - 192.168.255.255
10.0.0.0/8      # 10.0.0.0 - 10.255.255.255
```

### Are dynamically added entries persisted?

No. Runtime entries usually live in memory and are lost after restart unless you implement persistence.

Persist entries by writing them to a configuration file, environment-managed config source, or database.

### How can I persist allowlist changes?

```javascript
async function addGlobalWhitelist(ip) {
  this.globalWhitelist.push(ip);

  fs.writeFileSync(
    'config/ip-whitelist.json',
    JSON.stringify(this.getConfig(), null, 2),
  );

  await db.ipWhitelist.create({ ip, type: 'global' });
}
```

