<script setup lang="ts">
import { computed, inject, type Ref } from "vue";
import type { SchemaNode } from "@sokai/session";
import SchemaRenderer from "./SchemaRenderer.vue";

const props = defineProps<{ node: SchemaNode }>();

const dialogOpen = inject<Ref<boolean>>("sokaiDialogOpen")!;

const REGION_TYPES = new Set(["SearchForm", "Table", "Pagination", "Dialog"]);

const isRegion = computed(() => {
  return props.node.id.startsWith("region-") || REGION_TYPES.has(props.node.type);
});

const hookAttrs = computed(() => {
  const attrs: Record<string, string> = {};
  if (props.node.actionId) {
    attrs["data-sokai-action"] = props.node.actionId;
  }
  if (isRegion.value) {
    attrs["data-sokai-region"] = props.node.id;
  }
  return attrs;
});

const label = computed(() => String(props.node.props.label ?? props.node.props.title ?? ""));

const columns = computed(() => {
  const raw = props.node.props.columns;
  if (!Array.isArray(raw)) return [] as Array<{ label?: string; prop?: string }>;
  return raw as Array<{ label?: string; prop?: string }>;
});

function onButtonClick() {
  if (props.node.actionId === "action-open-blacklist-dialog") {
    dialogOpen.value = true;
  }
}

function closeDialog() {
  dialogOpen.value = false;
}
</script>

<template>
  <div v-if="node.type === 'Page'" class="sokai-page" v-bind="hookAttrs">
    <SchemaRenderer v-for="child in node.children ?? []" :key="child.id" :node="child" />
  </div>

  <section v-else-if="node.type === 'Heading'" class="sokai-heading" v-bind="hookAttrs">
    <h1>{{ label || node.props.text || "Heading" }}</h1>
  </section>

  <section v-else-if="node.type === 'SearchForm'" class="sokai-search" v-bind="hookAttrs">
    <div class="sokai-search__title">{{ label || "Search" }}</div>
    <SchemaRenderer v-for="child in node.children ?? []" :key="child.id" :node="child" />
  </section>

  <label v-else-if="node.type === 'Field'" class="sokai-field" v-bind="hookAttrs">
    <span>{{ label }}</span>
    <input :name="String(node.props.name ?? '')" type="text" />
  </label>

  <section v-else-if="node.type === 'Table'" class="sokai-table" v-bind="hookAttrs">
    <table>
      <thead>
        <tr>
          <th v-for="(col, i) in columns" :key="i">{{ col.label ?? col.prop }}</th>
          <th v-if="(node.children?.length ?? 0) > 0">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td v-for="(col, i) in columns" :key="i">—</td>
          <td v-if="(node.children?.length ?? 0) > 0" class="sokai-table__actions">
            <SchemaRenderer
              v-for="child in node.children ?? []"
              :key="child.id"
              :node="child"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </section>

  <nav v-else-if="node.type === 'Pagination'" class="sokai-pagination" v-bind="hookAttrs">
    <SchemaRenderer v-for="child in node.children ?? []" :key="child.id" :node="child" />
    <button v-if="!(node.children?.length)" type="button">下一页</button>
  </nav>

  <div
    v-else-if="node.type === 'Dialog'"
    class="sokai-dialog"
    v-bind="hookAttrs"
    v-show="dialogOpen"
  >
    <div class="sokai-dialog__panel">
      <header>{{ label || "Dialog" }}</header>
      <SchemaRenderer v-for="child in node.children ?? []" :key="child.id" :node="child" />
      <button type="button" @click="closeDialog">关闭</button>
    </div>
  </div>

  <button
    v-else-if="node.type === 'Button'"
    type="button"
    class="sokai-button"
    v-bind="hookAttrs"
    @click="onButtonClick"
  >
    {{ label || "Button" }}
  </button>

  <div v-else class="sokai-unknown" v-bind="hookAttrs" data-sokai-unknown>
    <span>Unknown: {{ node.type }}</span>
    <SchemaRenderer v-for="child in node.children ?? []" :key="child.id" :node="child" />
  </div>
</template>

<style scoped>
.sokai-page {
  font-family: system-ui, sans-serif;
  padding: 1rem;
  color: #1a1a1a;
}
.sokai-search,
.sokai-table,
.sokai-pagination,
.sokai-heading {
  margin: 0.75rem 0;
  padding: 0.75rem;
  border: 1px solid #ddd;
}
.sokai-table table {
  width: 100%;
  border-collapse: collapse;
}
.sokai-table th,
.sokai-table td {
  border: 1px solid #eee;
  padding: 0.35rem 0.5rem;
  text-align: left;
}
.sokai-field {
  display: inline-flex;
  gap: 0.35rem;
  margin-right: 0.5rem;
  align-items: center;
}
.sokai-button {
  margin-right: 0.35rem;
}
.sokai-dialog {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.sokai-dialog__panel {
  background: #fff;
  padding: 1rem 1.25rem;
  min-width: 280px;
  border: 1px solid #ccc;
}
.sokai-unknown {
  margin: 0.5rem 0;
  padding: 0.5rem;
  border: 1px dashed #999;
  color: #666;
  font-size: 0.85rem;
}
</style>
