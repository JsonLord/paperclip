import { runForbiddenTokenCheck } from "./scripts/check-forbidden-tokens.mjs";
runForbiddenTokenCheck({ repoRoot: process.cwd(), tokens: [] });
