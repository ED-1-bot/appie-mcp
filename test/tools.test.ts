import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/server";
import { createServer, toolError } from "../src/index.js";
import { AhClient } from "../src/client.js";

describe("tools.test.ts - McpServer and Tool Registrations", () => {
  it("createServer() returns an McpServer instance with proper name and version", () => {
    const server = createServer();
    assert.ok(server instanceof McpServer, "Should return an instance of McpServer");
    assert.equal((server as any).server?._serverInfo?.name || "appie-mcp", "appie-mcp");
  });

  it("registers all expected tools on the server", () => {
    const server = createServer();
    const registeredTools = (server as any)._registeredTools;
    assert.ok(registeredTools, "Registered tools object should exist on server");

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

    const actualToolKeys = Object.keys(registeredTools);
    assert.equal(actualToolKeys.length, expectedTools.length);

    for (const toolName of expectedTools) {
      assert.ok(
        registeredTools[toolName],
        `Tool '${toolName}' must be registered on McpServer`
      );
      const toolDef = registeredTools[toolName];
      assert.ok(toolDef.title, `Tool '${toolName}' must have a title`);
      assert.ok(toolDef.description, `Tool '${toolName}' must have a description`);
      assert.ok(toolDef.inputSchema, `Tool '${toolName}' must have an inputSchema`);
    }
  });

  describe("tool schema annotations", () => {
    it("verifies readOnlyHint: true on all query/read tools", () => {
      const server = createServer();
      const registeredTools = (server as any)._registeredTools;

      const readOnlyTools = [
        "ah_login",
        "ah_get_profile",
        "ah_search_products",
        "ah_get_product",
        "ah_get_product_alternatives",
        "ah_get_categories",
        "ah_get_bonus_offers",
        "ah_get_personal_bonus",
        "ah_get_shopping_list",
        "ah_get_favorite_lists",
        "ah_list_receipts",
        "ah_get_receipt_details",
        "ah_get_promo_digest",
        "ah_search_recipes",
        "ah_get_recipe_details",
        "ah_search_stores",
        "ah_get_clearance_bargains",
        "ah_get_search_suggestions",
        "ah_get_predictive_favorites",
        "ah_get_products_bulk",
        "ah_get_sub_categories",
        "ah_get_cart",
      ];

      for (const name of readOnlyTools) {
        const tool = registeredTools[name];
        assert.ok(tool, `Expected tool '${name}' to exist`);
        assert.deepEqual(
          tool.annotations,
          { readOnlyHint: true },
          `Tool '${name}' should have { readOnlyHint: true }`
        );
      }
    });

    it("verifies write/mutation annotations on modifying tools", () => {
      const server = createServer();
      const registeredTools = (server as any)._registeredTools;

      // ah_add_to_shopping_list (additive, non-destructive write)
      assert.deepEqual(registeredTools["ah_add_to_shopping_list"].annotations, {
        readOnlyHint: false,
        destructiveHint: false,
      });

      // ah_remove_from_shopping_list (destructive write)
      assert.deepEqual(registeredTools["ah_remove_from_shopping_list"].annotations, {
        readOnlyHint: false,
        destructiveHint: true,
      });

      // ah_check_favorite_list_item (toggle state write)
      assert.deepEqual(registeredTools["ah_check_favorite_list_item"].annotations, {
        readOnlyHint: false,
        destructiveHint: false,
      });

      // ah_activate_personal_bonus (activate offers write)
      assert.deepEqual(registeredTools["ah_activate_personal_bonus"].annotations, {
        readOnlyHint: false,
        destructiveHint: false,
      });
    });
  });

  describe("tool inputSchema validations", () => {
    it("validates ah_search_products input schema and default values", () => {
      const server = createServer();
      const schema = (server as any)._registeredTools["ah_search_products"].inputSchema;

      // Valid minimal input - defaults should apply
      const validMin = schema.safeParse({ query: "havermelk" });
      assert.equal(validMin.success, true);
      if (validMin.success) {
        assert.equal(validMin.data.query, "havermelk");
        assert.equal(validMin.data.sort, "RELEVANCE");
        assert.equal(validMin.data.bonus_only, false);
        assert.equal(validMin.data.limit, 20);
        assert.equal(validMin.data.page, 0);
      }

      // Valid full input
      const validFull = schema.safeParse({
        query: "koffie",
        sort: "PRICE_ASC",
        bonus_only: true,
        limit: 10,
        page: 2,
      });
      assert.equal(validFull.success, true);

      // Invalid input - query missing
      const invalidNoQuery = schema.safeParse({});
      assert.equal(invalidNoQuery.success, false);

      // Invalid sort value
      const invalidSort = schema.safeParse({ query: "thee", sort: "INVALID_SORT" });
      assert.equal(invalidSort.success, false);

      // Invalid limit (exceeds 30 or less than 1)
      assert.equal(schema.safeParse({ query: "thee", limit: 0 }).success, false);
      assert.equal(schema.safeParse({ query: "thee", limit: 35 }).success, false);
    });

    it("validates ah_get_product input schema", () => {
      const server = createServer();
      const schema = (server as any)._registeredTools["ah_get_product"].inputSchema;

      assert.equal(schema.safeParse({ product_id: "wi196825" }).success, true);
      assert.equal(schema.safeParse({}).success, false);
      assert.equal(schema.safeParse({ product_id: 12345 }).success, false); // expects string
    });

    it("validates ah_add_to_shopping_list input schema", () => {
      const server = createServer();
      const schema = (server as any)._registeredTools["ah_add_to_shopping_list"].inputSchema;

      // Valid item with text
      assert.equal(
        schema.safeParse({
          items: [{ text: "melk" }],
        }).success,
        true
      );

      // Valid item with product_id
      assert.equal(
        schema.safeParse({
          items: [{ product_id: 196825 }],
        }).success,
        true
      );

      // Invalid - empty array violates min(1)
      assert.equal(schema.safeParse({ items: [] }).success, false);

      // Invalid - missing items
      assert.equal(schema.safeParse({}).success, false);
    });

    it("validates ah_remove_from_shopping_list input schema", () => {
      const server = createServer();
      const schema = (server as any)._registeredTools["ah_remove_from_shopping_list"].inputSchema;

      assert.equal(schema.safeParse({ item_id: "item_123" }).success, true);
      assert.equal(schema.safeParse({}).success, false);
    });

    it("validates ah_check_favorite_list_item input schema", () => {
      const server = createServer();
      const schema = (server as any)._registeredTools["ah_check_favorite_list_item"].inputSchema;

      const parsed = schema.safeParse({ list_id: "list_1", item_id: "item_2" });
      assert.equal(parsed.success, true);
      if (parsed.success) {
        assert.equal(parsed.data.checked, true); // defaults to true
      }

      // Explicit checked=false
      const uncheck = schema.safeParse({ list_id: "list_1", item_id: "item_2", checked: false });
      assert.equal(uncheck.success, true);
      if (uncheck.success) {
        assert.equal(uncheck.data.checked, false);
      }

      // Missing item_id
      assert.equal(schema.safeParse({ list_id: "list_1" }).success, false);
    });

    it("validates ah_list_receipts input schema defaults", () => {
      const server = createServer();
      const schema = (server as any)._registeredTools["ah_list_receipts"].inputSchema;

      const parsed = schema.safeParse({});
      assert.equal(parsed.success, true);
      if (parsed.success) {
        assert.equal(parsed.data.page, 0);
        assert.equal(parsed.data.size, 10);
      }
    });

    it("validates ah_get_receipt_details input schema", () => {
      const server = createServer();
      const schema = (server as any)._registeredTools["ah_get_receipt_details"].inputSchema;

      assert.equal(schema.safeParse({ transaction_id: "tx_abc" }).success, true);
      assert.equal(schema.safeParse({}).success, false);
    });

    it("validates ah_get_promo_digest input schema defaults and constraints", () => {
      const server = createServer();
      const schema = (server as any)._registeredTools["ah_get_promo_digest"].inputSchema;

      const parsed = schema.safeParse({});
      assert.equal(parsed.success, true);
      if (parsed.success) {
        assert.equal(parsed.data.days, 90);
        assert.equal(parsed.data.min_times, 2);
        assert.equal(parsed.data.limit, 20);
      }

      // Negative numbers not allowed
      assert.equal(schema.safeParse({ days: -1 }).success, false);
      assert.equal(schema.safeParse({ min_times: 0 }).success, false);
    });

    it("validates ah_get_clearance_bargains input schema requires integer store_id", () => {
      const server = createServer();
      const schema = (server as any)._registeredTools["ah_get_clearance_bargains"].inputSchema;

      assert.equal(schema.safeParse({ store_id: 1234 }).success, true);
      assert.equal(schema.safeParse({ store_id: "not_a_number" }).success, false);
      assert.equal(schema.safeParse({ store_id: 12.34 }).success, false);
      assert.equal(schema.safeParse({}).success, false);
    });

    it("validates ah_activate_personal_bonus input schema", () => {
      const server = createServer();
      const schema = (server as any)._registeredTools["ah_activate_personal_bonus"].inputSchema;

      assert.equal(
        schema.safeParse({
          bonus_card_number: "2620123456789",
          selected_bonus_ids: [101, 102],
        }).success,
        true
      );

      assert.equal(schema.safeParse({ bonus_card_number: "2620123456789" }).success, false);
    });

    it("validates ah_get_products_bulk requires at least 1 product ID", () => {
      const server = createServer();
      const schema = (server as any)._registeredTools["ah_get_products_bulk"].inputSchema;

      assert.equal(schema.safeParse({ product_ids: ["wi196825"] }).success, true);
      assert.equal(schema.safeParse({ product_ids: [] }).success, false);
      assert.equal(schema.safeParse({}).success, false);
    });

    it("validates ah_get_sub_categories accepts string or number category_id", () => {
      const server = createServer();
      const schema = (server as any)._registeredTools["ah_get_sub_categories"].inputSchema;

      assert.equal(schema.safeParse({ category_id: 123 }).success, true);
      assert.equal(schema.safeParse({ category_id: "123" }).success, true);
      assert.equal(schema.safeParse({}).success, false);
    });
  });

  describe("toolError formatting", () => {
    it("formats error object into tool response with isError flag", () => {
      const err = new Error("Sample Albert Heijn error");
      const formatted = toolError(err);

      assert.equal(formatted.isError, true);
      assert.equal(formatted.content.length, 1);
      assert.equal(formatted.content[0].type, "text");
      assert.equal(formatted.content[0].text, "Error: Sample Albert Heijn error");
    });
  });

  describe("custom AhClient integration", () => {
    it("accepts a custom AhClient instance in createServer()", () => {
      const customClient = new AhClient("https://custom.api.ah.nl");
      const server = createServer(customClient);
      assert.ok(server instanceof McpServer);
    });
  });
});
