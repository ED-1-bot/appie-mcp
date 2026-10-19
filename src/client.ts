import { AUTH_CONFIG, authFetch, getValidAccessToken } from "./auth.js";
import {
  AhProduct,
  BonusOffer,
  FavoriteList,
  MemberProfile,
  Receipt,
  Recipe,
  ShoppingList,
  ShoppingListItem,
  StoreInfo,
} from "./types.js";

export class AhClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = AUTH_CONFIG.api_base) {
    this.baseUrl = baseUrl;
  }

  private async request<T = any>(
    endpoint: string,
    options: { method?: string; body?: any; query?: Record<string, any> } = {}
  ): Promise<T> {
    const token = await getValidAccessToken();
    const method = options.method || "GET";

    let urlStr = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint}`;
    if (options.query) {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== null && v !== "") {
          sp.set(k, String(v));
        }
      }
      const qs = sp.toString();
      if (qs) {
        urlStr += (urlStr.includes("?") ? "&" : "?") + qs;
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };

    let bodyStr: string | undefined;
    if (options.body) {
      headers["Content-Type"] = "application/json";
      bodyStr = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }

    const resp = await authFetch(urlStr, {
      method,
      headers,
      body: bodyStr,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Albert Heijn API error (${resp.status}) at ${endpoint}: ${errText}`);
    }

    return (await resp.json()) as T;
  }

  /**
   * 1. Member Profile & Bonus Card
   */
  async getProfile(): Promise<MemberProfile> {
    const data = await this.request<any>("/mobile-services/member/v1/profile");
    return {
      name: data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim() || undefined,
      email: data.email,
      bonusCardNumber: data.bonusCardNumber || data.bonusCard?.cardNumber,
      hasBonusCard: Boolean(data.hasBonusCard || data.bonusCardNumber),
      memberId: data.memberId || data.id,
    };
  }

  /**
   * 2. Catalog & Product Search
   */
  async searchProducts(options: {
    query: string;
    sort?: "RELEVANCE" | "PRICE_ASC" | "PRICE_DESC";
    page?: number;
    size?: number;
    bonusOnly?: boolean;
  }): Promise<{ products: AhProduct[]; total: number }> {
    const queryParams: Record<string, any> = {
      query: options.query,
      sortOn: options.sort || "RELEVANCE",
      page: options.page ?? 0,
      size: options.size ?? 20,
    };
    if (options.bonusOnly) {
      queryParams.filter = "bonus=Bonus";
    }

    const data = await this.request<any>("/mobile-services/product/search/v2", {
      query: queryParams,
    });

    const rawProducts = data.products || [];
    const products: AhProduct[] = rawProducts.map((p: any) => this.mapProduct(p));

    return {
      products,
      total: data.page?.totalElements ?? products.length,
    };
  }

  async getProduct(productId: string | number): Promise<AhProduct> {
    const cleanId = String(productId).replace(/^wi/, "");
    const data = await this.request<any>(`/mobile-services/product/detail/v4/products/${cleanId}`);
    return this.mapProduct(data.productCard || data);
  }

  async getProductAlternatives(productId: string | number): Promise<AhProduct[]> {
    const cleanId = String(productId).replace(/^wi/, "");
    const data = await this.request<any[]>(
      `/mobile-services/product/detail/v4/products/${cleanId}/alternatives`
    );
    if (!Array.isArray(data)) return [];
    return data.map((p: any) => this.mapProduct(p));
  }

  async getProductsBulk(productIds: Array<string | number>): Promise<AhProduct[]> {
    const ids = productIds.map((id) => String(id).replace(/^wi/, "")).join(",");
    const data = await this.request<any>(
      `/mobile-services/product/detail/v4/products/bulk`,
      { query: { productIds: ids } }
    );
    const rawList = Array.isArray(data) ? data : data.products || [];
    return rawList.map((p: any) => this.mapProduct(p));
  }

  async getCategories(): Promise<any[]> {
    return await this.request<any[]>("/mobile-services/v1/product-shelves/categories");
  }

  async getSubCategories(categoryId: string | number): Promise<any[]> {
    return await this.request<any[]>(
      `/mobile-services/v1/product-shelves/categories/${categoryId}/sub-categories`
    );
  }

  /**
   * 3. Bonus Deals & Promotions
   */
  async getBonusOffers(query: string = ""): Promise<AhProduct[]> {
    const res = await this.searchProducts({
      query,
      bonusOnly: true,
      size: 30,
    });
    return res.products;
  }

  async getBonusGroupProducts(segmentId: number | string): Promise<AhProduct[]> {
    const data = await this.request<any>(
      `/mobile-services/bonus-group/v1/segments/${segmentId}/products`
    );
    const rawProducts = data.products || (Array.isArray(data) ? data : []);
    return rawProducts.map((p: any) => this.mapProduct(p));
  }

  async getPersonalBonus(): Promise<any[]> {
    const data = await this.request<any>("/mobile-services/bonusbox/v1");
    return data.bonusBox || data.offers || (Array.isArray(data) ? data : []);
  }

  async getClearanceBargains(storeId: number): Promise<any[]> {
    const graphqlQuery = {
      query: `query GetBargainItems($storeId: Int!) {
        store(id: $storeId) {
          id
          bargainItems {
            productId
            title
            wasPrice
            nowPrice
            discountPercentage
            expirationDate
            stockStatus
          }
        }
      }`,
      operationName: "GetBargainItems",
      variables: { storeId },
    };

    const resp = await this.request<any>("/graphql", {
      method: "POST",
      body: graphqlQuery,
    });
    return resp.data?.store?.bargainItems || [];
  }

  /**
   * 4. Shopping Lists (Main & Favorites)
   */
  async getShoppingList(): Promise<ShoppingList> {
    const data = await this.request<any>("/mobile-services/shoppinglist/v2");
    const rawItems = data.items || [];
    const items: ShoppingListItem[] = rawItems.map((item: any) => ({
      id: item.id || item.listItemId,
      type: item.type || (item.product ? "PRODUCT" : "FREE_TEXT"),
      text: item.text || item.product?.title,
      productId: item.productId || item.product?.id,
      product: item.product ? this.mapProduct(item.product) : undefined,
      quantity: item.quantity || 1,
      checked: Boolean(item.checked),
    }));

    return {
      id: data.id,
      items,
      totalItems: items.length,
    };
  }

  async addShoppingListItems(
    items: Array<{ type?: "FREE_TEXT" | "PRODUCT"; text?: string; productId?: number; quantity?: number }>
  ): Promise<any> {
    const payload = {
      items: items.map((i) => ({
        type: i.type || (i.productId ? "PRODUCT" : "FREE_TEXT"),
        text: i.text,
        productId: i.productId,
        quantity: i.quantity || 1,
      })),
    };
    return await this.request<any>("/mobile-services/shoppinglist/v2/items", {
      method: "POST",
      body: payload,
    });
  }

  async removeShoppingListItem(itemId: string | number): Promise<any> {
    return await this.request<any>(`/mobile-services/shoppinglist/v2/items/${itemId}`, {
      method: "DELETE",
    });
  }

  async getFavoriteLists(): Promise<FavoriteList[]> {
    const data = await this.request<any[]>("/mobile-services/lists/v3/lists");
    if (!Array.isArray(data)) return [];
    return data.map((l: any) => ({
      id: l.id,
      title: l.title || l.name,
      itemCount: l.itemCount || l.items?.length || 0,
      items: l.items?.map((item: any) => ({
        id: item.id,
        type: "PRODUCT",
        text: item.product?.title || item.title,
        productId: item.productId || item.product?.id,
        checked: Boolean(item.checked),
        quantity: item.quantity || 1,
      })),
    }));
  }

  async addFavoriteListItem(
    listId: string,
    item: { productId: number; quantity?: number; originCode?: string }
  ): Promise<any> {
    return await this.request<any>(`/mobile-services/lists/v3/lists/${listId}/items`, {
      method: "POST",
      body: {
        originCode: item.originCode || "SEARCH",
        productId: item.productId,
        quantity: item.quantity || 1,
      },
    });
  }

  async setFavoriteListItemChecked(
    listId: string,
    itemId: string,
    checked: boolean = true
  ): Promise<any> {
    return await this.request<any>(
      `/mobile-services/lists/v3/lists/${listId}/items/${itemId}`,
      {
        method: "PATCH",
        body: { checked },
      }
    );
  }

  async removeFavoriteListItem(listId: string, itemId: string): Promise<any> {
    return await this.request<any>(
      `/mobile-services/lists/v3/lists/${listId}/items/${itemId}`,
      {
        method: "DELETE",
      }
    );
  }

  /**
   * 5. Digital Receipts (Kassabonnen)
   */
  async listReceipts(page: number = 0, size: number = 10): Promise<Receipt[]> {
    const data = await this.request<any[]>("/mobile-services/v1/receipts", {
      query: { page, size },
    });
    if (!Array.isArray(data)) return [];

    return data.map((r: any) => ({
      transactionId: r.transactionId || r.id,
      transactionDate: r.transactionDate || r.date,
      total: r.total?.amount ?? r.totalAmount ?? 0,
      totalDiscount: r.totalDiscount?.amount,
      storeId: r.storeId,
      storeName: r.storeName || r.store?.name,
    }));
  }

  async getReceiptDetails(transactionId: string): Promise<Receipt> {
    const data = await this.request<any>(
      `/mobile-services/v2/receipts/${transactionId}`
    );
    const rawLines = data.lines || data.receiptLines || [];
    return {
      transactionId: data.transactionId || transactionId,
      transactionDate: data.transactionDate || data.date,
      total: data.total?.amount ?? data.totalAmount ?? 0,
      totalDiscount: data.totalDiscount?.amount,
      storeId: data.storeId,
      storeName: data.storeName,
      lines: rawLines.map((l: any) => ({
        description: l.description || l.text || l.productTitle || "",
        quantity: l.quantity || 1,
        price: l.amount?.amount ?? l.price ?? 0,
        discount: l.discount?.amount ?? l.discountAmount,
        unitPrice: l.unitPrice?.amount,
      })),
    };
  }

  /**
   * 6. Habit-Based Deals (Promo Digest)
   * Mines recent receipts for frequently bought products, and reports those currently on sale.
   */
  async getPromoDigest(options: {
    days?: number;
    minTimes?: number;
    limit?: number;
  } = {}): Promise<any> {
    const days = options.days || 90;
    const minTimes = options.minTimes || 2;
    const limit = options.limit || 25;

    const receipts = await this.listReceipts(0, 30);
    const cutoff = Date.now() - days * 86400 * 1000;
    const itemCounts = new Map<string, { count: number; name: string }>();

    for (const r of receipts) {
      const rTime = new Date(r.transactionDate).getTime();
      if (rTime < cutoff) continue;
      try {
        const details = await this.getReceiptDetails(r.transactionId);
        for (const line of details.lines || []) {
          const key = line.description.trim().toLowerCase();
          if (!key || line.price <= 0) continue;
          const prev = itemCounts.get(key) || { count: 0, name: line.description };
          prev.count += 1;
          itemCounts.set(key, prev);
        }
      } catch {
        // Skip inaccessible receipts
      }
    }

    const frequent = Array.from(itemCounts.values())
      .filter((x) => x.count >= minTimes)
      .sort((a, b) => b.count - a.count);

    const bonusOffers = await this.getBonusOffers();
    const digestResults: any[] = [];

    for (const item of frequent) {
      if (digestResults.length >= limit) break;
      // Search for live product pricing & promotions
      try {
        const searchRes = await this.searchProducts({ query: item.name, size: 3 });
        const match = searchRes.products.find((p) => p.bonus);
        if (match) {
          digestResults.push({
            frequentItem: item.name,
            purchasedTimes: item.count,
            matchedProduct: match.title,
            currentPrice: match.price.now,
            regularPrice: match.price.was,
            discountType: match.discountType,
            bonusMechanism: match.bonusMechanism,
          });
        }
      } catch {
        // Skip
      }
    }

    return {
      frequentProductsFound: frequent.length,
      currentOffersFound: digestResults.length,
      offers: digestResults,
    };
  }

  /**
   * 7. Allerhande Recipes
   */
  async searchRecipes(query: string, page: number = 0, size: number = 10): Promise<Recipe[]> {
    const data = await this.request<any>("/mobile-services/recipe/v2/search", {
      query: { query, page, size },
    });
    const rawList = data.recipes || (Array.isArray(data) ? data : []);
    return rawList.map((r: any) => ({
      id: r.id,
      title: r.title || r.name,
      servings: r.servings,
      prepTimeMinutes: r.prepTime || r.cookingTime,
      imageUrl: r.image?.url || r.imageUrl,
      ingredients: (r.ingredients || []).map((ing: any) => ({
        name: ing.name || ing.ingredient,
        amount: ing.amount,
        unit: ing.unit,
        productId: ing.productId,
      })),
    }));
  }

  async getRecipeDetails(recipeId: string | number): Promise<Recipe> {
    const data = await this.request<any>(`/mobile-services/recipe/v2/${recipeId}`);
    return {
      id: data.id || recipeId,
      title: data.title || data.name,
      servings: data.servings,
      prepTimeMinutes: data.prepTime || data.cookingTime,
      imageUrl: data.image?.url || data.imageUrl,
      instructions: data.instructions || data.steps || [],
      ingredients: (data.ingredients || []).map((ing: any) => ({
        name: ing.name || ing.ingredient,
        amount: ing.amount,
        unit: ing.unit,
        productId: ing.productId,
        available: ing.available,
      })),
    };
  }

  /**
   * 8. Store Locator
   */
  async searchStores(postalCodeOrCity?: string): Promise<StoreInfo[]> {
    const data = await this.request<any[]>("/mobile-services/store/v1/stores", {
      query: postalCodeOrCity ? { query: postalCodeOrCity } : undefined,
    });
    if (!Array.isArray(data)) return [];
    return data.map((s: any) => ({
      id: s.id,
      name: s.name || s.address?.street,
      street: s.address?.street || s.street,
      postalCode: s.address?.postalCode || s.postalCode,
      city: s.address?.city || s.city,
      distanceKm: s.distance,
      isOpenNow: s.isOpenNow,
      facilities: s.facilities || [],
    }));
  }

  /**
   * 9. Active Online Cart
   */
  async getCart(): Promise<any> {
    return await this.request<any>("/mobile-services/order/v1/cart");
  }

  /**
   * 10. Suggestions, Predictive Favorites & Bonus Box Activation
   */
  async getSearchSuggestions(query: string, amount: number = 10): Promise<string[]> {
    const data = await this.request<any>(
      "/mobile-services/product/search/v2/suggestions",
      { query: { query, amount } }
    );
    return data.suggestions || [];
  }

  async getPredictiveFavorites(): Promise<any[]> {
    const data = await this.request<any>("/favorieten/predictive-list");
    return Array.isArray(data) ? data : data.items || [];
  }

  async activatePersonalBonus(bonusCardNumber: string, selectedBonusIds: number[]): Promise<any> {
    return await this.request<any>("https://api.ah.nl/handscanner/v1/bonuses", {
      method: "PATCH",
      body: {
        bonusCardNumber,
        selectedBonusIds,
      },
    });
  }

  private mapProduct(raw: any): AhProduct {
    const current = raw.currentPrice ?? raw.price?.now;
    const regular = raw.priceBeforeBonus ?? raw.price?.was ?? raw.previousPrice;
    const isDiscounted =
      current !== null &&
      current !== undefined &&
      regular !== null &&
      regular !== undefined &&
      current !== regular;

    return {
      id: raw.webshopId || raw.id || raw.webProductId,
      webProductId: raw.webshopId
        ? `wi${raw.webshopId}`
        : raw.webProductId
        ? `wi${raw.webProductId}`
        : undefined,
      title: raw.title || raw.name || "",
      summary:
        raw.summary ||
        raw.descriptionHighlights ||
        raw.descriptionFull ||
        raw.description,
      brand: raw.brand,
      price: {
        now: (isDiscounted ? current : (current ?? regular)) ?? 0,
        was: isDiscounted ? regular : undefined,
        unitSizeDescription:
          raw.salesUnitSize ||
          raw.price?.unitSizeDescription ||
          raw.unitSizeDescription,
        theme: raw.price?.theme,
      },
      unitPriceDescription:
        raw.unitPriceDescription || raw.price?.unitPriceDescription,
      bonus: Boolean(raw.isBonus || raw.bonus || raw.shield?.bonus || isDiscounted),
      bonusMechanism: raw.bonusMechanism || raw.shield?.text,
      discountType: raw.discountType || raw.price?.discountType,
      images: raw.images || (raw.image ? [raw.image] : []),
      category: raw.mainCategory || raw.category || raw.taxonomy?.name,
      availableOnline: raw.availableOnline,
    };
  }
}
