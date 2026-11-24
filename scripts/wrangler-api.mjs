import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLACEHOLDER_D1_ID = "00000000-0000-0000-0000-000000000000";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseConfigPath = path.join(root, "wrangler.jsonc");
const localConfigPath = path.join(root, "wrangler.local.jsonc");
const generatedConfigPath = path.join(root, ".wrangler", "wrangler.deploy.json");
const wranglerEntrypoint = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");

function parseJsonc(source) {
  const withoutComments = source.replace(
    /"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
    (match) => (match.startsWith('"') ? match : ""),
  );
  const withoutTrailingCommas = withoutComments.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(withoutTrailingCommas);
}

function resolveConfig(args) {
  const envConfig = process.env.WRANGLER_CONFIG?.trim();
  if (envConfig) {
    const resolved = path.resolve(root, envConfig);
    if (!existsSync(resolved)) {
      console.error(`WRANGLER_CONFIG file not found: ${resolved}`);
      process.exit(1);
    }
    return { configPath: resolved, args };
  }

  if (existsSync(localConfigPath)) {
    return { configPath: localConfigPath, args };
  }

  const d1Id = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim();
  const d1Name = process.env.CLOUDFLARE_D1_DATABASE_NAME?.trim();
  const r2Bucket = process.env.CLOUDFLARE_R2_BUCKET?.trim();
  const workerName = process.env.CLOUDFLARE_API_WORKER_NAME?.trim();

  if (d1Id || d1Name || r2Bucket || workerName) {
    const config = parseJsonc(readFileSync(baseConfigPath, "utf8"));
    const prod = config.env?.production;
    if (!prod) {
      console.error("Missing env.production block in wrangler.jsonc.");
      process.exit(1);
    }
    if (workerName) prod.name = workerName;
    if (prod.d1_databases?.[0]) {
      if (d1Id) prod.d1_databases[0].database_id = d1Id;
      if (d1Name) prod.d1_databases[0].database_name = d1Name;
    }
    if (r2Bucket && prod.r2_buckets?.[0]) {
      prod.r2_buckets[0].bucket_name = r2Bucket;
    }
    mkdirSync(path.dirname(generatedConfigPath), { recursive: true });
    writeFileSync(generatedConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    const nextArgs =
      d1Name && args[0] === "d1" && args[1] === "migrations" && args[2] === "apply" && args[3]
        ? [...args.slice(0, 3), d1Name, ...args.slice(4)]
        : args;
    return { configPath: generatedConfigPath, args: nextArgs };
  }

  return { configPath: baseConfigPath, args };
}

const rawArgs = process.argv.slice(2);
const printOnly = rawArgs[0] === "--print-config";
const effectiveArgs = printOnly ? rawArgs.slice(1) : rawArgs;
const { configPath, args } = resolveConfig(effectiveArgs);

const isProdRemote =
  args.includes("production") && !args.includes("--dry-run") && !args.includes("--local");
if (isProdRemote) {
  const parsed = parseJsonc(readFileSync(configPath, "utf8"));
  const prodD1Id = parsed.env?.production?.d1_databases?.[0]?.database_id;
  if (!prodD1Id || prodD1Id === PLACEHOLDER_D1_ID) {
    console.error(
      [
        `Refusing to run against placeholder production database_id (${PLACEHOLDER_D1_ID}) in ${path.relative(root, configPath)}.`,
        "Configure your real production D1 ID using one of:",
        "  1. Local deploy: copy wrangler.jsonc to wrangler.local.jsonc (gitignored) and set env.production.d1_databases[0].database_id.",
        "  2. CI / env deploy: set CLOUDFLARE_D1_DATABASE_ID (and optional CLOUDFLARE_API_WORKER_NAME / CLOUDFLARE_R2_BUCKET).",
        "  3. Explicit file: set WRANGLER_CONFIG=/path/to/wrangler.prod.jsonc.",
      ].join("\n"),
    );
    process.exit(1);
  }
}

if (printOnly) {
  console.log(JSON.stringify({ configPath: path.relative(root, configPath), args }));
  process.exit(0);
}

const result = spawnSync(process.execPath, [wranglerEntrypoint, ...args, "-c", configPath], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
