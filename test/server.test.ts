import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/index.js";

test("createServer: registers all 26 tools", () => {
  const server = createServer();
  const registered = Object.keys((server as any)._registeredTools);

  assert.strictEqual(registered.length, 26);

  const expectedTools = [
    "ah_login",
    "ah_get_profile",
    "ah_search_products",
    "ah_get_product",
    "ah_get_product_alternatives",
    "ah_get_categories",
    "ah_get_bonus_offers",
    "ah_get_personal_bonus",
    "ah_get_shopping_list",
    "ah_add_to_shopping_list",
    "ah_remove_from_shopping_list",
    "ah_get_favorite_lists",
    "ah_check_favorite_list_item",
    "ah_list_receipts",
    "ah_get_receipt_details",
    "ah_get_promo_digest",
    "ah_search_recipes",
    "ah_get_recipe_details",
    "ah_search_stores",
    "ah_get_clearance_bargains",
    "ah_get_search_suggestions",
    "ah_get_predictive_favorites",
    "ah_activate_personal_bonus",
    "ah_get_products_bulk",
    "ah_get_sub_categories",
    "ah_get_cart",
  ];

  for (const tool of expectedTools) {
    assert.ok(registered.includes(tool), `Expected tool ${tool} to be registered`);
  }
});

test("createServer: ah_activate_personal_bonus has correct annotations", () => {
  const server = createServer();
  const tool = (server as any)._registeredTools["ah_activate_personal_bonus"];
  assert.ok(tool, "ah_activate_personal_bonus tool should be registered");
  assert.deepStrictEqual(tool.annotations, { readOnlyHint: false, destructiveHint: false });
});

test("createServer: ah_get_cart has readOnlyHint true", () => {
  const server = createServer();
  const tool = (server as any)._registeredTools["ah_get_cart"];
  assert.ok(tool, "ah_get_cart tool should be registered");
  assert.deepStrictEqual(tool.annotations, { readOnlyHint: true });
});
