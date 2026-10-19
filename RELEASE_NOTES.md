# Release Notes: appie-mcp v0.1.0

We are pleased to announce the initial release of **appie-mcp (v0.1.0)**, an open-source Model Context Protocol (MCP) server for **Albert Heijn (Appie)**. This server enables AI assistants (such as Claude Desktop, Cursor, Continue, and autonomous coding agents) to interact directly with Albert Heijn's supermarket services.

---

## 🌟 Highlights

- **26 Complete MCP Tools**: Full coverage of Albert Heijn APIs, covering customer profile, product catalog, weekly bonus folders, personal Bonus Box, shopping lists, digital receipts, Allerhande recipes, active cart, and store locators.
- **Automated Authentication**: One-click stealth browser login flow that launches Chrome, intercepts authentication tokens, and safely stores them with restricted permissions (`0600`).
- **Habit-Based Deals (`ah_get_promo_digest`)**: Cross-references frequent purchases from digital cash register receipts with live weekly promotions to proactively notify users when their favorites go on sale.
- **Graceful Error Handling**: 404 and empty search results in recipe lookups return friendly fallback structures instead of throwing unhandled exceptions.
- **Continuous Integration**: Automated CI workflows testing across Node.js 20.x and 22.x LTS runtimes.

---

## 🛠️ Complete Tool Directory (26 Tools)

### 1. Authentication & Member Profile
| Tool | Type | Description |
| :--- | :---: | :--- |
| `ah_login` | Read | Verify Albert Heijn session status, member identity, and Bonus card connection. |
| `ah_get_profile` | Read | Retrieve customer loyalty profile, name, email, and 13-digit Bonus card number. |

### 2. Product Search & Catalog
| Tool | Type | Description |
| :--- | :---: | :--- |
| `ah_search_products` | Read | Search supermarket catalog by query with sorting and bonus-only filters. |
| `ah_get_product` | Read | Inspect detailed product specifications, nutritional values, allergens, and prices. |
| `ah_get_product_alternatives` | Read | Find brand swaps, store-brand alternatives, or dietary substitutes for a product. |
| `ah_get_products_bulk` | Read | Fetch product cards in bulk for multiple product IDs (e.g. `['wi196825', 'wi187593']`). |
| `ah_get_search_suggestions` | Read | Get search query autocomplete keywords and suggestions. |
| `ah_get_predictive_favorites` | Read | Retrieve predictive favorite recommendations and reorder candidates. |

### 3. Categories & Shelves
| Tool | Type | Description |
| :--- | :---: | :--- |
| `ah_get_categories` | Read | Browse top-level supermarket departments and category shelves. |
| `ah_get_sub_categories` | Read | Fetch child subcategories for a given category ID. |

### 4. Promotions, Bonus Deals & Bonus Box
| Tool | Type | Description |
| :--- | :---: | :--- |
| `ah_get_bonus_offers` | Read | Browse active weekly national Bonus folder promotions (1+1 gratis, 2e halve prijs). |
| `ah_get_personal_bonus` | Read | Retrieve personalized weekly 5-deal Bonus Box promotions for the member. |
| `ah_activate_personal_bonus` | Write | Activate selected weekly Bonus Box offers for a Bonus card number. |
| `ah_get_promo_digest` | Read | Cross-reference past receipt history against current promotions to find staple discounts. |

### 5. Shopping Lists & Favorite Lists (Mijn Lijstjes)
| Tool | Type | Description |
| :--- | :---: | :--- |
| `ah_get_shopping_list` | Read | Retrieve primary in-app shopping list items and free-text notes. |
| `ah_add_to_shopping_list` | Write | Add products or free-text grocery items to the primary shopping list. |
| `ah_remove_from_shopping_list` | Write | Remove an item from the primary shopping list by ID. |
| `ah_get_favorite_lists` | Read | Retrieve user's custom favorite lists (*Mijn Lijstjes*) and item counts. |
| `ah_check_favorite_list_item` | Write | Mark items as checked/collected (or unchecked) in a favorite list. |

### 6. Active Online Cart
| Tool | Type | Description |
| :--- | :---: | :--- |
| `ah_get_cart` | Read | Read-only view of the user's active Albert Heijn online shopping cart and order summary. |

### 7. Digital Receipts (Kassabonnen)
| Tool | Type | Description |
| :--- | :---: | :--- |
| `ah_list_receipts` | Read | List recent in-store receipts (*kassabonnen*) with store location, date, and totals. |
| `ah_get_receipt_details` | Read | Get complete line items, discounts, unit prices, and payment details for a receipt. |

### 8. Allerhande Recipes
| Tool | Type | Description |
| :--- | :---: | :--- |
| `ah_search_recipes` | Read | Search Allerhande recipe collection by dish title, ingredient, or dietary preference. |
| `ah_get_recipe_details` | Read | Get step-by-step cooking instructions and mapped ingredient lists. |

### 9. Store Locator & Clearance
| Tool | Type | Description |
| :--- | :---: | :--- |
| `ah_search_stores` | Read | Search nearby Albert Heijn stores by city or postal code with opening hours and facilities. |
| `ah_get_clearance_bargains` | Read | Fetch today-only dynamic clearance markdowns (*vandaag-af* / 35% discount items) by store ID. |

---

## 🔒 Security & Safety
- **Human-in-the-Loop Checkout**: No automated order submission or payment processing.
- **Safe Token Storage**: Session tokens are saved to `tokens.json` with user-only permissions (`0600`).
- **Read-Only / Safe Hints**: Write tools are clearly identified with MCP annotations (`readOnlyHint: false`).
