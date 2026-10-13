# Ticketing system

Express + TypeScript + Prisma API backed by Postgres, with Redis for caching and ticket-inventory counters.

## Run with Docker

```sh
cp .env.example .env        # set JWT_SECRET (required) and PAYMENT_WEBHOOK_SECRET
docker compose up --build   # API on :3000, Postgres, Redis; migrations run on boot
```

## Redis is optional at runtime

If Redis is unreachable the API keeps serving: event reads go straight to Postgres, and reservations
claim stock with an atomic conditional `UPDATE` in Postgres instead of the Redis counter (no oversell,
just slower under contention). When Redis reconnects, its counters/caches are purged and re-warm from Postgres.
Unpaid orders are expired by a Postgres-driven sweeper (every 30s), so holds are released even with Redis down.

## Tests

```sh
npm test                                              # unit + route tests (mocked Postgres/Redis)
docker compose -f docker-compose.test.yml up -d       # throwaway Postgres :5433 + Redis :6380
npm run test:integration                              # needs DATABASE_URL_TEST / REDIS_URL_TEST (see .env.example)
```
