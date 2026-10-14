import type { ServiceName } from "../backend/Backend.js";

export const SERVICES: Record<
  ServiceName,
  { image: string; env: Record<string, string>; urlEnv: [string, string] }
> = {
  postgres: {
    image: "postgres:18",
    env: { POSTGRES_PASSWORD: "airlock" },
    urlEnv: ["DATABASE_URL", "postgres://postgres:airlock@postgres:5432/postgres"],
  },
  redis: { image: "redis:8-alpine", env: {}, urlEnv: ["REDIS_URL", "redis://redis:6379"] },
};
