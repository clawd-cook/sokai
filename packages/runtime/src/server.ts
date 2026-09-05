import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { SESSION_BUNDLE_PATHS, type NetworkEntry } from "@sokai/session";

export interface StartPreviewServerOptions {
  schemaPath: string;
  bundleDir?: string;
  port?: number;
  mock?: boolean;
}

export interface PreviewServerHandle {
  baseUrl: string;
  close(): Promise<void>;
}

function parseJsonl<T>(content: string): T[] {
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function resolvePackageRoot(): string {
  // Node 20.11+ exposes import.meta.dirname for the current module directory.
  if (typeof import.meta.dirname === "string") {
    return join(import.meta.dirname, "..");
  }
  try {
    return fileURLToPath(new URL("..", import.meta.url));
  } catch {
    // Vitest browser-like environments may rewrite import.meta.url.
    return process.cwd();
  }
}

/**
 * Start a Vite preview/dev server that serves the Vue schema runtime.
 * Schema is exposed at `/schema.json`; optional network at `/network.json`.
 */
export async function startPreviewServer(
  options: StartPreviewServerOptions,
): Promise<PreviewServerHandle> {
  const packageRoot = resolvePackageRoot();
  const schemaJson = await readFile(options.schemaPath, "utf8");

  let network: NetworkEntry[] = [];
  if (options.bundleDir) {
    const networkPath = join(options.bundleDir, SESSION_BUNDLE_PATHS.network);
    try {
      const raw = await readFile(networkPath, "utf8");
      network = parseJsonl<NetworkEntry>(raw);
    } catch {
      network = [];
    }
  }

  const mockEnabled = options.mock !== false;
  const networkJson = JSON.stringify(network);

  const server: ViteDevServer = await createServer({
    configFile: false,
    root: packageRoot,
    resolve: {
      // Client graph must not pull Node-only @sokai/session barrel (bundle.ts → fs).
      alias: {
        "@sokai/session": fileURLToPath(
          new URL("../../session/src/browser.ts", import.meta.url),
        ),
      },
      conditions: ["browser", "module", "import", "default"],
    },
    plugins: [
      vue(),
      {
        name: "sokai-preview-assets",
        configureServer(srv) {
          srv.middlewares.use((req, res, next) => {
            if (req.url === "/schema.json" || req.url?.startsWith("/schema.json?")) {
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(schemaJson);
              return;
            }
            if (req.url === "/network.json" || req.url?.startsWith("/network.json?")) {
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(networkJson);
              return;
            }
            next();
          });
        },
      },
    ],
    define: {
      "import.meta.env.SOKAI_SCHEMA_PATH": JSON.stringify(options.schemaPath),
      "import.meta.env.SOKAI_MOCK": JSON.stringify(mockEnabled),
    },
    server: {
      port: options.port ?? 0,
      strictPort: options.port !== undefined && options.port !== 0,
    },
  });

  await server.listen();
  const urls = server.resolvedUrls;
  const baseUrl = urls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${options.port ?? 0}`;

  return {
    baseUrl,
    async close() {
      await server.close();
    },
  };
}
