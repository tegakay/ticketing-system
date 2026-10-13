// Runs before any test file imports src/, because src/utils/jwt.ts throws at
// import time when JWT_SECRET is missing.
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';
