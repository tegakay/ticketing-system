import "dotenv/config";
import app from "./app.js";
import { prisma } from "./lib/prisma.js";
import { redis, redisSub } from "./lib/redis.js";
import { startOrderExpirySweeper } from "./services/orderExpiry.service.js";

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const server = app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
const sweeper = startOrderExpirySweeper();

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  clearInterval(sweeper);
  // Stop accepting connections, let in-flight requests finish, then close backends.
  server.close(async () => {
    await prisma.$disconnect();
    redis.disconnect();
    redisSub.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
