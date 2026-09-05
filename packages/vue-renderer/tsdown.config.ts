import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/jdesign.ts"],
  format: ["esm"],
  fixedExtension: false,
  dts: true,
  clean: true,
  external: [
    "vue",
    "zod",
    "@json-render/core",
    "@json-render/vue",
    "@jd/jdesign-vue",
    "@jd/jdesign-vue-pro",
  ],
});
