# appie-mcp

Model Context Protocol (MCP) server for **Albert Heijn (Appie)**. Connects AI assistants (like Claude Desktop, Cursor, and Continue) directly to Albert Heijn’s supermarket services.

Features include **product search**, **weekly Bonus offers**, **personal Bonus Box**, **Mijn Lijstjes (favorite lists) with item completion**, **digital receipts (kassabonnen)**, **Allerhande recipes**, and **habit-based discount alerts**.

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Log In
Run the interactive login command:
```bash
npm run login
```
* **Seamless Authentication:** Automatically launches Google Chrome in stealth mode, opens Albert Heijn's sign-in page, intercepts the `appie://login-exit` redirect, and saves the tokens to `tokens.json`. No copy-pasting required!
* **Headless / Manual Fallback:** If you're on a headless server, run `npm run login -- --manual` to paste the authorization redirect manually.

### 3. Check Status
```bash
npm run status
```
Verifies your live Albert Heijn connection, checks your Bonus card number, and confirms session validity.

### 4. Build
```bash
npm run build
```

---

## 🛠️ MCP Tools

| Tool | Type | Description |
| :--- | :---: | :--- |
| `ah_login` | Read | Check session status and verify customer identity & Bonus card. |
| `ah_get_profile` | Read | Get customer loyalty profile, name, email, and 13-digit Bonus card. |
| `ah_search_products` | Read | Search product catalog by keyword, with price sorting and bonus filters. |
| `ah_get_product` | Read | Get detailed product info (pricing, nutrition, allergens, unit sizes). |
| `ah_get_product_alternatives`| Read | Find brand swaps, store-brand alternatives, or dietary substitutes. |
| `ah_get_categories` | Read | Browse top-level supermarket shelves/categories. |
| `ah_get_bonus_offers` | Read | Browse active weekly Bonus folder promotions (1+1 gratis, 2e halve prijs). |
| `ah_get_personal_bonus` | Read | View the 5 personalized weekly Bonus Box offers for the member. |
| `ah_get_shopping_list` | Read | Retrieve the primary in-app shopping list items and notes. |
| `ah_add_to_shopping_list` | Write | Add free-text items or products to the primary shopping list. |
| `ah_remove_from_shopping_list`| Write | Remove an item from the primary shopping list. |
| `ah_get_favorite_lists` | Read | List saved custom lists (*Mijn Lijstjes*, e.g., 'Weekly Staples', 'Party'). |
| `ah_check_favorite_list_item`| Write | Tick off items as collected in a favorite list (`checked: true/false`). |
| `ah_list_receipts` | Read | List recent in-store receipts (*kassabonnen*) with dates and totals. |
| `ah_get_receipt_details` | Read | Inspect line items, unit prices, discounts, and payment method for a receipt. |
| `ah_get_promo_digest` | Read | Mines recent receipts to answer: *"What that I frequently buy is on Bonus discount right now?"* |
| `ah_search_recipes` | Read | Search official Allerhande recipes by dish name or ingredient. |
| `ah_get_recipe_details` | Read | Get step-by-step cooking instructions and mapped ingredient lists. |
| `ah_get_clearance_bargains` | Read | Query store-specific clearance markdowns (*vandaag-af* / 35% discount items). |
| `ah_search_stores` | Read | Search nearby AH stores, facilities, and opening hours. |

---

## ⚙️ Configuration in Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "appie": {
      "command": "node",
      "args": ["/Users/robert/Developer/appie-mcp/dist/index.js"]
    }
  }
}
```

---

## 🔒 Safety & Guardrails
* **No Automatic Checkout:** The server does not handle payment, credit cards, or final order submission. All purchases and checkout actions remain strictly human-in-the-loop.
* **Stateless Token Refreshing:** Tokens are safely stored locally in `tokens.json` (with restricted `0600` permissions) and silently renewed in the background.

## 📄 License
MIT © Robert Schulze Dieckhoff
