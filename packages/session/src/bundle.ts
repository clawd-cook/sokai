import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redactNetworkEntry } from "./redact.js";
import {
  SESSION_BUNDLE_PATHS,
  type ActionEntry,
  type BundleIndex,
  type NetworkEntry,
  type SessionMeta,
} from "./types.js";

export interface SessionBundleWriteInput {
  meta: SessionMeta;
  actions: ActionEntry[];
  network: NetworkEntry[];
  index: BundleIndex;
  keyframes: { name: string; bytes: Uint8Array }[];
  domSnapshots: { name: string; json: unknown }[];
}

export interface SessionBundleReadOutput {
  meta: SessionMeta;
  actions: ActionEntry[];
  network: NetworkEntry[];
  index: BundleIndex;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseJsonl<T>(content: string): T[] {
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  return lines.map((line) => JSON.parse(line) as T);
}

function toJsonl<T>(entries: T[]): string {
  if (entries.length === 0) return "";
  return entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
}

export async function writeSessionBundle(
  dir: string,
  bundle: SessionBundleWriteInput,
): Promise<void> {
  await mkdir(join(dir, SESSION_BUNDLE_PATHS.keyframes), { recursive: true });
  await mkdir(join(dir, SESSION_BUNDLE_PATHS.dom), { recursive: true });

  await writeFile(
    join(dir, SESSION_BUNDLE_PATHS.meta),
    JSON.stringify(bundle.meta, null, 2) + "\n",
    "utf8",
  );
  await writeFile(join(dir, SESSION_BUNDLE_PATHS.actions), toJsonl(bundle.actions), "utf8");

  const redactedNetwork = bundle.network.map(redactNetworkEntry);
  await writeFile(join(dir, SESSION_BUNDLE_PATHS.network), toJsonl(redactedNetwork), "utf8");
  await writeFile(
    join(dir, SESSION_BUNDLE_PATHS.index),
    JSON.stringify(bundle.index, null, 2) + "\n",
    "utf8",
  );

  for (const keyframe of bundle.keyframes) {
    await writeFile(join(dir, SESSION_BUNDLE_PATHS.keyframes, keyframe.name), keyframe.bytes);
  }

  for (const snapshot of bundle.domSnapshots) {
    await writeFile(
      join(dir, SESSION_BUNDLE_PATHS.dom, snapshot.name),
      JSON.stringify(snapshot.json, null, 2) + "\n",
      "utf8",
    );
  }
}

export async function readSessionBundle(dir: string): Promise<SessionBundleReadOutput> {
  const metaRaw = await readFile(join(dir, SESSION_BUNDLE_PATHS.meta), "utf8");
  const meta = JSON.parse(metaRaw) as SessionMeta;

  const actionsRaw = await readFile(join(dir, SESSION_BUNDLE_PATHS.actions), "utf8");
  const actions = parseJsonl<ActionEntry>(actionsRaw);

  const networkRaw = await readFile(join(dir, SESSION_BUNDLE_PATHS.network), "utf8");
  const network = parseJsonl<NetworkEntry>(networkRaw);

  const indexRaw = await readFile(join(dir, SESSION_BUNDLE_PATHS.index), "utf8");
  const index = JSON.parse(indexRaw) as BundleIndex;

  return { meta, actions, network, index };
}

export async function assertValidBundleDir(dir: string): Promise<void> {
  const metaPath = join(dir, SESSION_BUNDLE_PATHS.meta);
  const actionsPath = join(dir, SESSION_BUNDLE_PATHS.actions);

  if (!(await fileExists(metaPath))) {
    throw new Error(`Invalid session bundle: missing ${SESSION_BUNDLE_PATHS.meta} in ${dir}`);
  }
  if (!(await fileExists(actionsPath))) {
    throw new Error(`Invalid session bundle: missing ${SESSION_BUNDLE_PATHS.actions} in ${dir}`);
  }
}
