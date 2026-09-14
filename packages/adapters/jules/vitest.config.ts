import { defineProject } from "vitest/config";
export default defineProject({ test: { name: "@paperclipai/adapter-jules", environment: "node", include: ["src/**/*.test.ts"] } });
