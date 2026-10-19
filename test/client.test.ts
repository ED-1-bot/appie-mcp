import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AhClient } from "../src/client.js";
import { saveTokens } from "../src/auth.js";
import { AhProduct } from "../src/types.js";

describe("client.ts - AhClient", () => {
  let client: AhClient;
  let tmpDir: string;
  let originalTokensFile: string | undefined;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "appie-client-test-"));
    originalTokensFile = process.env.APPIE_TOKENS_FILE;
    process.env.APPIE_TOKENS_FILE = path.join(tmpDir, "tokens.json");
    originalFetch = globalThis.fetch;

    // Provide a valid unexpired token in mock storage so getValidAccessToken succeeds without network call
    saveTokens({
      access_token: "test_access_token_12345",
      expires_in: 7200,
      saved_at: new Date().toISOString(),
    });

    client = new AhClient("https://api.ah.nl");
  });

  afterEach(() => {
    if (originalTokensFile !== undefined) {
      process.env.APPIE_TOKENS_FILE = originalTokensFile;
    } else {
      delete process.env.APPIE_TOKENS_FILE;
    }
    globalThis.fetch = originalFetch;

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe("mapProduct() logic", () => {
    it("maps regular product without discount or bonus flags", () => {
      const raw = {
        webshopId: 196825,
        title: "AH Zaanse mayonaise",
        summary: "Romige mayonaise in tube",
        brand: "AH",
        currentPrice: 1.89,
        priceBeforeBonus: 1.89,
        salesUnitSize: "170 ml",
        mainCategory: "Sauzen",
        availableOnline: true,
      };

      const product = client.mapProduct(raw);

      assert.equal(product.id, 196825);
      assert.equal(product.webProductId, "wi196825");
      assert.equal(product.title, "AH Zaanse mayonaise");
      assert.equal(product.summary, "Romige mayonaise in tube");
      assert.equal(product.brand, "AH");
      assert.equal(product.price.now, 1.89);
      assert.equal(product.price.was, undefined);
      assert.equal(product.price.unitSizeDescription, "170 ml");
      assert.equal(product.bonus, false);
      assert.equal(product.category, "Sauzen");
      assert.equal(product.availableOnline, true);
    });

    it("maps discounted product with currentPrice and priceBeforeBonus", () => {
      const raw = {
        webshopId: 200100,
        title: "Lavazza Koffiebonen",
        currentPrice: 14.99,
        priceBeforeBonus: 21.99,
        isBonus: true,
        bonusMechanism: "€7.00 korting",
        discountType: "DISCOUNT_FIXED",
      };

      const product = client.mapProduct(raw);

      assert.equal(product.price.now, 14.99);
      assert.equal(product.price.was, 21.99);
      assert.equal(product.bonus, true);
      assert.equal(product.bonusMechanism, "€7.00 korting");
      assert.equal(product.discountType, "DISCOUNT_FIXED");
    });

    it("detects discount when currentPrice != priceBeforeBonus even without explicit bonus flag", () => {
      const raw = {
        id: 3001,
        title: "Campina Halfvolle Melk",
        currentPrice: 1.29,
        priceBeforeBonus: 1.59,
      };

      const product = client.mapProduct(raw);

      assert.equal(product.price.now, 1.29);
      assert.equal(product.price.was, 1.59);
      assert.equal(product.bonus, true); // isDiscounted sets bonus=true
    });

    it("handles nested price object (price.now and price.was)", () => {
      const raw = {
        id: 4001,
        title: "De Ruijter Hagelslag",
        price: {
          now: 2.19,
          was: 2.79,
          unitSizeDescription: "400 g",
          theme: "bonus",
          discountType: "PERCENTAGE",
          unitPriceDescription: "€5.48/kg",
        },
      };

      const product = client.mapProduct(raw);

      assert.equal(product.price.now, 2.19);
      assert.equal(product.price.was, 2.79);
      assert.equal(product.price.unitSizeDescription, "400 g");
      assert.equal(product.price.theme, "bonus");
      assert.equal(product.unitPriceDescription, "€5.48/kg");
      assert.equal(product.bonus, true);
      assert.equal(product.discountType, "PERCENTAGE");
    });

    it("handles null and undefined prices gracefully", () => {
      const rawWithNulls = {
        id: 5001,
        title: "Product with null prices",
        currentPrice: null,
        priceBeforeBonus: null,
      };

      const productNull = client.mapProduct(rawWithNulls);
      assert.equal(productNull.price.now, 0);
      assert.equal(productNull.price.was, undefined);
      assert.equal(productNull.bonus, false);

      const rawEmpty = {
        id: 5002,
        title: "Product with no price fields",
      };

      const productEmpty = client.mapProduct(rawEmpty);
      assert.equal(productEmpty.price.now, 0);
      assert.equal(productEmpty.price.was, undefined);
      assert.equal(productEmpty.bonus, false);
    });

    it("handles previousPrice fallback when currentPrice is absent", () => {
      const raw = {
        id: 6001,
        title: "Item with only previousPrice",
        previousPrice: 3.5,
      };

      const product = client.mapProduct(raw);
      assert.equal(product.price.now, 3.5);
      assert.equal(product.price.was, undefined);
      assert.equal(product.bonus, false);
    });

    it("handles bonus flags: shield.bonus, shield.text, and bonus property", () => {
      const rawShield = {
        id: 7001,
        title: "Shield bonus product",
        currentPrice: 2.0,
        priceBeforeBonus: 2.0,
        shield: {
          bonus: true,
          text: "1+1 gratis",
        },
      };

      const prodShield = client.mapProduct(rawShield);
      assert.equal(prodShield.bonus, true);
      assert.equal(prodShield.bonusMechanism, "1+1 gratis");

      const rawBonus = {
        id: 7002,
        title: "Direct bonus property",
        currentPrice: 1.5,
        bonus: true,
      };

      const prodBonus = client.mapProduct(rawBonus);
      assert.equal(prodBonus.bonus, true);
    });

    it("resolves description hierarchy: summary > descriptionHighlights > descriptionFull > description", () => {
      // 1. summary wins
      const p1 = client.mapProduct({
        id: 1,
        summary: "Summary text",
        descriptionHighlights: "Highlights",
        descriptionFull: "Full",
        description: "Desc",
      });
      assert.equal(p1.summary, "Summary text");

      // 2. descriptionHighlights wins when summary is missing
      const p2 = client.mapProduct({
        id: 2,
        descriptionHighlights: "Highlights",
        descriptionFull: "Full",
        description: "Desc",
      });
      assert.equal(p2.summary, "Highlights");

      // 3. descriptionFull wins when highlights missing
      const p3 = client.mapProduct({
        id: 3,
        descriptionFull: "Full",
        description: "Desc",
      });
      assert.equal(p3.summary, "Full");

      // 4. description wins when others missing
      const p4 = client.mapProduct({
        id: 4,
        description: "Desc",
      });
      assert.equal(p4.summary, "Desc");

      // 5. undefined when none provided
      const p5 = client.mapProduct({ id: 5 });
      assert.equal(p5.summary, undefined);
    });

    it("maps ID and webProductId with 'wi' prefix appropriately", () => {
      // From webshopId
      const p1 = client.mapProduct({ webshopId: 12345 });
      assert.equal(p1.id, 12345);
      assert.equal(p1.webProductId, "wi12345");

      // From webProductId
      const p2 = client.mapProduct({ webProductId: 67890 });
      assert.equal(p2.id, 67890);
      assert.equal(p2.webProductId, "wi67890");

      // From raw id alone
      const p3 = client.mapProduct({ id: 999 });
      assert.equal(p3.id, 999);
      assert.equal(p3.webProductId, undefined);
    });

    it("maps image arrays and single image objects", () => {
      // Array of images
      const p1 = client.mapProduct({
        id: 1,
        images: [{ url: "https://img.ah.nl/1.jpg" }, { url: "https://img.ah.nl/2.jpg" }],
      });
      assert.equal(p1.images?.length, 2);
      assert.equal(p1.images?.[0].url, "https://img.ah.nl/1.jpg");

      // Single image object
      const p2 = client.mapProduct({
        id: 2,
        image: { url: "https://img.ah.nl/single.jpg" },
      });
      assert.deepEqual(p2.images, [{ url: "https://img.ah.nl/single.jpg" }]);

      // No image
      const p3 = client.mapProduct({ id: 3 });
      assert.deepEqual(p3.images, []);
    });

    it("resolves category fallbacks: mainCategory > category > taxonomy.name", () => {
      const p1 = client.mapProduct({ id: 1, mainCategory: "Cat 1", category: "Cat 2" });
      assert.equal(p1.category, "Cat 1");

      const p2 = client.mapProduct({ id: 2, category: "Cat 2", taxonomy: { name: "Cat 3" } });
      assert.equal(p2.category, "Cat 2");

      const p3 = client.mapProduct({ id: 3, taxonomy: { name: "Cat 3" } });
      assert.equal(p3.category, "Cat 3");
    });
  });

  describe("request parameter formatting", () => {
    it("formats query parameters and omits null, undefined, and empty string values", async () => {
      let requestedUrl = "";
      globalThis.fetch = async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify({ products: [], page: { totalElements: 0 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      await client.searchProducts({
        query: "havermelk",
        sort: "PRICE_ASC",
        page: 2,
        size: 15,
        bonusOnly: true,
      });

      const parsed = new URL(requestedUrl);
      assert.equal(parsed.pathname, "/mobile-services/product/search/v2");
      assert.equal(parsed.searchParams.get("query"), "havermelk");
      assert.equal(parsed.searchParams.get("sortOn"), "PRICE_ASC");
      assert.equal(parsed.searchParams.get("page"), "2");
      assert.equal(parsed.searchParams.get("size"), "15");
      assert.equal(parsed.searchParams.get("filter"), "bonus=Bonus");
    });

    it("properly appends query parameters when endpoint already contains '?'", async () => {
      let requestedUrl = "";
      globalThis.fetch = async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      await client.request("/test-endpoint?staticKey=1", {
        query: { dynamicKey: "value2" },
      });

      const parsed = new URL(requestedUrl);
      assert.equal(parsed.searchParams.get("staticKey"), "1");
      assert.equal(parsed.searchParams.get("dynamicKey"), "value2");
    });

    it("strips 'wi' prefix from product IDs in getProduct", async () => {
      let requestedUrl = "";
      globalThis.fetch = async (input) => {
        requestedUrl = String(input);
        return new Response(
          JSON.stringify({ productCard: { id: 196825, title: "Test Product" } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const product = await client.getProduct("wi196825");
      assert.equal(product.id, 196825);
      assert.ok(requestedUrl.endsWith("/mobile-services/product/detail/v4/products/196825"));
    });

    it("formats comma-separated productIds in getProductsBulk", async () => {
      let requestedUrl = "";
      globalThis.fetch = async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      await client.getProductsBulk(["wi100", 200, "wi300"]);
      const parsed = new URL(requestedUrl);
      assert.equal(parsed.pathname, "/mobile-services/product/detail/v4/products/bulk");
      assert.equal(parsed.searchParams.get("productIds"), "100,200,300");
    });

    it("formats request body, sets Content-Type and Authorization headers", async () => {
      let requestMethod = "";
      let authHeader = "";
      let contentType = "";
      let requestBody = "";

      globalThis.fetch = async (input, init) => {
        requestMethod = init?.method || "GET";
        const headers = init?.headers as Record<string, string>;
        authHeader = headers?.["Authorization"] || "";
        contentType = headers?.["Content-Type"] || "";
        requestBody = String(init?.body || "");

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      await client.addShoppingListItems([
        { text: "Bio bananen", quantity: 3, type: "FREE_TEXT" },
        { productId: 196825, quantity: 1, type: "PRODUCT" },
      ]);

      assert.equal(requestMethod, "POST");
      assert.equal(authHeader, "Bearer test_access_token_12345");
      assert.equal(contentType, "application/json");

      const parsedBody = JSON.parse(requestBody);
      assert.equal(parsedBody.items.length, 2);
      assert.equal(parsedBody.items[0].text, "Bio bananen");
      assert.equal(parsedBody.items[0].quantity, 3);
      assert.equal(parsedBody.items[0].type, "FREE_TEXT");
      assert.equal(parsedBody.items[1].productId, 196825);
      assert.equal(parsedBody.items[1].type, "PRODUCT");
    });
  });

  describe("error wrapping when AH returns error statuses", () => {
    it("wraps 400 Bad Request with endpoint and error details", async () => {
      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ error: "bad_request", message: "Invalid parameters" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      };

      await assert.rejects(
        async () => {
          await client.request("/mobile-services/order/v1/cart");
        },
        (err: Error) => {
          assert.ok(err.message.includes("Albert Heijn API error (400)"));
          assert.ok(err.message.includes("/mobile-services/order/v1/cart"));
          assert.ok(err.message.includes("bad_request"));
          return true;
        }
      );
    });

    it("wraps 401 Unauthorized with descriptive message", async () => {
      globalThis.fetch = async () => {
        return new Response("Unauthorized token expired", { status: 401 });
      };

      await assert.rejects(
        async () => {
          await client.getProfile();
        },
        (err: Error) => {
          assert.ok(err.message.includes("Albert Heijn API error (401)"));
          assert.ok(err.message.includes("/mobile-services/member/v1/profile"));
          assert.ok(err.message.includes("Unauthorized token expired"));
          return true;
        }
      );
    });

    it("wraps 500 Internal Server Error", async () => {
      globalThis.fetch = async () => {
        return new Response("Internal Gateway Error", { status: 500 });
      };

      await assert.rejects(
        async () => {
          await client.getClearanceBargains(1234);
        },
        (err: Error) => {
          assert.ok(err.message.includes("Albert Heijn API error (500)"));
          assert.ok(err.message.includes("/graphql"));
          assert.ok(err.message.includes("Internal Gateway Error"));
          return true;
        }
      );
    });

    it("preserves 404 error handling in general request calls", async () => {
      globalThis.fetch = async () => {
        return new Response("Resource not found", { status: 404 });
      };

      await assert.rejects(
        async () => {
          await client.request("/mobile-services/v1/unknown");
        },
        (err: Error) => {
          assert.ok(err.message.includes("Albert Heijn API error (404)"));
          assert.ok(err.message.includes("/mobile-services/v1/unknown"));
          return true;
        }
      );
    });

    // Existing recipe 404 fallback behavior
    it("searchRecipes returns empty array on 404", async () => {
      client.request = async () => {
        const err = new Error("Albert Heijn API error (404) at /mobile-services/recipe/v2/search: Not Found");
        (err as any).status = 404;
        throw err;
      };

      const results = await client.searchRecipes("nonexistent_recipe");
      assert.deepStrictEqual(results, []);
    });

    it("getRecipeDetails returns descriptive message on 404", async () => {
      client.request = async () => {
        const err = new Error("Albert Heijn API error (404) at /mobile-services/recipe/v2/999999: Not Found");
        (err as any).status = 404;
        throw err;
      };

      const details = await client.getRecipeDetails("999999");
      assert.strictEqual((details as any).error, "Not Found");
      assert.ok((details as any).message.includes("999999"));
    });
  });

  describe("API method mappings", () => {
    it("getProfile maps profile details correctly", async () => {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            firstName: "Jan",
            lastName: "Jansen",
            email: "jan@example.com",
            bonusCardNumber: "2620123456789",
            hasBonusCard: true,
            memberId: "mem_1001",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const profile = await client.getProfile();
      assert.equal(profile.name, "Jan Jansen");
      assert.equal(profile.email, "jan@example.com");
      assert.equal(profile.bonusCardNumber, "2620123456789");
      assert.equal(profile.hasBonusCard, true);
      assert.equal(profile.memberId, "mem_1001");
    });

    it("getShoppingList maps product items and free text items correctly", async () => {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            id: "list_abc",
            items: [
              { id: "item_1", text: "Appels", checked: false, quantity: 2 },
              {
                id: "item_2",
                product: { webshopId: 196825, title: "AH Zaanse Mayonaise", currentPrice: 1.89 },
                checked: true,
                quantity: 1,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const list = await client.getShoppingList();
      assert.equal(list.id, "list_abc");
      assert.equal(list.totalItems, 2);

      assert.equal(list.items[0].type, "FREE_TEXT");
      assert.equal(list.items[0].text, "Appels");
      assert.equal(list.items[0].checked, false);

      assert.equal(list.items[1].type, "PRODUCT");
      assert.equal(list.items[1].checked, true);
      assert.equal(list.items[1].product?.title, "AH Zaanse Mayonaise");
      assert.equal(list.items[1].product?.price.now, 1.89);
    });

    it("listReceipts and getReceiptDetails map receipt and line item data", async () => {
      // 1. listReceipts
      globalThis.fetch = async (input) => {
        const urlStr = String(input);
        if (urlStr.includes("/mobile-services/v1/receipts")) {
          return new Response(
            JSON.stringify([
              {
                transactionId: "tx_987",
                transactionDate: "2026-10-15T12:30:00.000Z",
                total: { amount: 15.5 },
                totalDiscount: { amount: 2.5 },
                storeName: "AH Amsterdam Dam",
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        // 2. getReceiptDetails
        return new Response(
          JSON.stringify({
            transactionId: "tx_987",
            transactionDate: "2026-10-15T12:30:00.000Z",
            total: { amount: 15.5 },
            lines: [
              {
                description: "Halfvolle Melk 1L",
                quantity: 2,
                amount: { amount: 2.58 },
                unitPrice: { amount: 1.29 },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const receipts = await client.listReceipts();
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].transactionId, "tx_987");
      assert.equal(receipts[0].total, 15.5);
      assert.equal(receipts[0].totalDiscount, 2.5);
      assert.equal(receipts[0].storeName, "AH Amsterdam Dam");

      const details = await client.getReceiptDetails("tx_987");
      assert.equal(details.transactionId, "tx_987");
      assert.equal(details.lines?.length, 1);
      assert.equal(details.lines?.[0].description, "Halfvolle Melk 1L");
      assert.equal(details.lines?.[0].quantity, 2);
      assert.equal(details.lines?.[0].price, 2.58);
      assert.equal(details.lines?.[0].unitPrice, 1.29);
    });

    it("searchStores maps store addresses and opening status", async () => {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify([
            {
              id: 1234,
              name: "AH Museumplein",
              address: { street: "Van Baerlestraat 33", postalCode: "1071AP", city: "Amsterdam" },
              distance: 1.2,
              isOpenNow: true,
              facilities: ["ZELFSCAN", "GALL_AND_GALL"],
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const stores = await client.searchStores("Amsterdam");
      assert.equal(stores.length, 1);
      assert.equal(stores[0].id, 1234);
      assert.equal(stores[0].name, "AH Museumplein");
      assert.equal(stores[0].street, "Van Baerlestraat 33");
      assert.equal(stores[0].postalCode, "1071AP");
      assert.equal(stores[0].city, "Amsterdam");
      assert.equal(stores[0].distanceKm, 1.2);
      assert.equal(stores[0].isOpenNow, true);
      assert.deepEqual(stores[0].facilities, ["ZELFSCAN", "GALL_AND_GALL"]);
    });
  });
});
