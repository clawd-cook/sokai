import { parsePageSchema, type NetworkEntry } from "@sokai/session";
import { mountPreview } from "./mount.js";

async function loadJson<T>(url: string): Promise<T | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}

async function boot(): Promise<void> {
  const el = document.getElementById("app");
  if (!el) {
    throw new Error("#app element not found");
  }

  const schemaRaw = await loadJson<unknown>("/schema.json");
  if (!schemaRaw) {
    el.textContent = "Failed to load /schema.json (set SOKAI_SCHEMA_PATH via startPreviewServer)";
    return;
  }

  const schema = parsePageSchema(schemaRaw);
  const network = (await loadJson<NetworkEntry[]>("/network.json")) ?? [];
  const mockEnv = import.meta.env.SOKAI_MOCK;
  const mock = mockEnv !== false && mockEnv !== "false";

  mountPreview(el, schema, { network, mock });
}

void boot();
