import assert from "node:assert/strict";
import test from "node:test";
import { resolveProductMode } from "../src/product-mode";

test("public product mode requires an explicit safe workspace", () => {
  assert.deepEqual(resolveProductMode({}), { enabled: false, workspaceId: "", workspaceLabel: "Meliora Demo" });
  assert.equal(resolveProductMode({ VITE_MELIORA_PRODUCT_MODE: "public", VITE_MELIORA_WORKSPACE_ID: "../private" }).workspaceId, "");
  assert.deepEqual(resolveProductMode({
    VITE_MELIORA_PRODUCT_MODE: "public",
    VITE_MELIORA_WORKSPACE_ID: "portfolio-demo",
    VITE_MELIORA_WORKSPACE_LABEL: "作品集演示项目",
  }), { enabled: true, workspaceId: "portfolio-demo", workspaceLabel: "作品集演示项目" });
});
