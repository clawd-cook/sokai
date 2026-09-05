#!/usr/bin/env tsx
import { access } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { runBacktest } from "@sokai/backtest";
import { startRecording } from "@sokai/record";
import { buildPageSchemaFromBundle } from "@sokai/schema";
import { writePageSchema } from "@sokai/session";

const USAGE = `Usage: sokai <command> [options]

Commands:
  record    Record a page session into a SessionBundle
  schema    Build PageSchema from a SessionBundle
  preview   Serve a Vue preview of a PageSchema
  backtest  Replay recorded actions against a schema

sokai record --url <url> --out <dir> [--user-data-dir <path>] [--pilot-tag compose-pool-list]
sokai schema --bundle <dir> --out <file> [--no-llm]
sokai preview --schema <file> [--bundle <dir>] [--port 5173]
sokai backtest --bundle <dir> (--schema <file> | --target-url <url>) [--live] [--fail-fast] [--out report.json]
`;

async function walkForMarker(start: string, marker: string): Promise<string | undefined> {
  let dir = start;
  for (;;) {
    try {
      await access(join(dir, marker));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) return undefined;
      dir = parent;
    }
  }
}

/** Walk cwd (then this module) for `pnpm-workspace.yaml` or the sample fixture. */
export async function findRepoRoot(start = process.cwd()): Promise<string> {
  const starts = [start];
  if (typeof import.meta.dirname === "string") {
    starts.push(import.meta.dirname);
  }
  for (const from of starts) {
    const found =
      (await walkForMarker(from, "pnpm-workspace.yaml")) ??
      (await walkForMarker(from, "fixtures/compose-pool/sample-v1"));
    if (found) return found;
  }
  throw new Error("Could not find sokai repo root (pnpm-workspace.yaml)");
}

/** Absolute paths as-is; relative paths resolve against repo root, not cwd. */
export async function resolveCliPath(input: string): Promise<string> {
  if (isAbsolute(input)) return input;
  return resolve(await findRepoRoot(), input);
}

/** Wait until the user presses Enter, or Ctrl+C / SIGTERM. */
function waitForRecordingStop(): Promise<void> {
  return new Promise((resolveWait) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      try {
        process.stdin.pause();
      } catch {
        // ignore
      }
      process.stdin.off("data", onData);
      process.off("SIGINT", onSig);
      process.off("SIGTERM", onSig);
      resolveWait();
    };
    const onData = (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (text.includes("\n") || text.includes("\r")) done();
    };
    const onSig = () => done();

    if (process.stdin.isTTY) {
      process.stdin.resume();
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", onData);
    }
    process.on("SIGINT", onSig);
    process.on("SIGTERM", onSig);
  });
}

function waitForSignal(): Promise<void> {
  return new Promise((resolveWait) => {
    const onStop = () => {
      process.off("SIGINT", onStop);
      process.off("SIGTERM", onStop);
      resolveWait();
    };
    process.on("SIGINT", onStop);
    process.on("SIGTERM", onStop);
  });
}

async function cmdRecord(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      url: { type: "string" },
      out: { type: "string" },
      "user-data-dir": { type: "string" },
      "pilot-tag": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(
      "sokai record --url <url> --out <dir> [--user-data-dir <path>] [--pilot-tag compose-pool-list]",
    );
    return 0;
  }
  if (!values.url || !values.out) {
    console.error("record requires --url and --out");
    return 1;
  }

  const handle = await startRecording({
    url: values.url,
    outDir: await resolveCliPath(values.out),
    userDataDir: values["user-data-dir"]
      ? await resolveCliPath(values["user-data-dir"])
      : undefined,
    pilotTag: values["pilot-tag"] ?? "compose-pool-list",
  });
  console.log("Recording… operate in the Chrome window.");
  console.log("When finished, press Enter here to save the session (prefer Enter over Ctrl+C).");
  await waitForRecordingStop();
  console.log("Stopping… writing session bundle (do not interrupt)");
  const dir = await handle.stop();
  console.log(`Wrote session bundle: ${dir}`);
  return 0;
}

async function cmdSchema(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      bundle: { type: "string" },
      out: { type: "string" },
      "no-llm": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log("sokai schema --bundle <dir> --out <file> [--no-llm]");
    return 0;
  }
  if (!values.bundle || !values.out) {
    console.error("schema requires --bundle and --out");
    return 1;
  }

  const schema = await buildPageSchemaFromBundle(await resolveCliPath(values.bundle), {
    noLlm: values["no-llm"] === true,
  });
  await writePageSchema(await resolveCliPath(values.out), schema);
  return 0;
}

async function cmdPreview(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      schema: { type: "string" },
      bundle: { type: "string" },
      port: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log("sokai preview --schema <file> [--bundle <dir>] [--port 5173]");
    return 0;
  }
  if (!values.schema) {
    console.error("preview requires --schema");
    return 1;
  }

  // Import server-only entry — the package root re-exports mountPreview (.vue),
  // which Node/tsx cannot load. Vite inside startPreviewServer compiles Vue.
  const { startPreviewServer } = await import("@sokai/runtime/server");
  const handle = await startPreviewServer({
    schemaPath: await resolveCliPath(values.schema),
    bundleDir: values.bundle ? await resolveCliPath(values.bundle) : undefined,
    port: values.port !== undefined ? Number(values.port) : 5173,
  });
  console.log(handle.baseUrl);
  await waitForSignal();
  await handle.close();
  return 0;
}

async function cmdBacktest(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      bundle: { type: "string" },
      schema: { type: "string" },
      "target-url": { type: "string" },
      live: { type: "boolean", default: false },
      "fail-fast": { type: "boolean", default: false },
      out: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(
      "sokai backtest --bundle <dir> (--schema <file> | --target-url <url>) [--live] [--fail-fast] [--out report.json]",
    );
    return 0;
  }
  if (!values.bundle || (!values.schema && !values["target-url"])) {
    console.error("backtest requires --bundle and either --schema or --target-url");
    return 1;
  }

  const report = await runBacktest({
    bundleDir: await resolveCliPath(values.bundle),
    schemaPath: values.schema ? await resolveCliPath(values.schema) : undefined,
    targetUrl: values["target-url"],
    mode: values.live ? "live" : values["target-url"] ? "live" : "mock",
    failFast: values["fail-fast"] === true,
    outPath: values.out ? await resolveCliPath(values.out) : undefined,
  });
  console.log(JSON.stringify(report.summary, null, 2));
  return report.summary.failed > 0 ? 1 : 0;
}

export async function runCli(argv: string[]): Promise<number> {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE);
    return 0;
  }

  try {
    switch (command) {
      case "record":
        return await cmdRecord(args.slice(1));
      case "schema":
        return await cmdSchema(args.slice(1));
      case "preview":
        return await cmdPreview(args.slice(1));
      case "backtest":
        return await cmdBacktest(args.slice(1));
      default:
        console.error(`Unknown command: ${command}`);
        console.log(USAGE);
        return 1;
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  const code = await runCli(process.argv.slice(2));
  process.exit(code);
}
