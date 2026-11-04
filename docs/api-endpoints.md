# Backend endpoints and feature names

Every route in the 8 backend controllers (`silhoufit-api/src/**/*.controller.ts`), with its feature name and where the frontend uses it.

**Naming.** Feature names are written "Area – Action" (for example "Wishlist – Clear all"). Commit messages reuse them: `feat: Wishlist – Clear all`. A `/** Feature: <name> */` tag marks the service function of each endpoint connected from the round it was added onward.

Status: **Connected** (a UI calls it), **Connected this round**, **Service only** (the function exists but no UI calls it), **Not connected** (no function and no UI), **Blocked-needs backend** (the backend cannot support the UI yet; see the ticket in the hand-off notes).

| Feature name | Method + path | Frontend file (service function) | UI location | Status |
| --- | --- | --- | --- | --- |
| System – Health check | `GET /` | `src/service/checkHealth.ts` (`checkHealth`) | 500 page, "Check service status" button | Connected this round |
| Addresses – List | `GET /users/me/addresses` | `src/service/addresses.ts` (`listAddresses`, `loadAddresses`) | Profile > Delivery address; Checkout | Connected |
| Addresses – Get one | `GET /users/me/addresses/:addressId` | `src/service/addresses.ts` (`getAddressById`) | Profile > Delivery address (refresh after not-found) | Connected |
| Addresses – Add | `POST /users/me/addresses` | `src/service/addresses.ts` (`createAddress`) | Address form (Profile, Checkout) | Connected |
| Addresses – Edit | `PATCH /users/me/addresses/:addressId` | `src/service/addresses.ts` (`updateAddress`) | Address form; set default | Connected |
| Addresses – Delete | `DELETE /users/me/addresses/:addressId` | `src/service/addresses.ts` (`deleteAddress`) | Profile > Delivery address, Delete | Connected |
| Body profile – Get | `GET /users/me/body-profile` | `src/service/bodyProfile.ts` (`getBodyProfile`) | Profile > Body measurements; AR fitting | Connected |
| Body profile – Save | `PUT /users/me/body-profile` | `src/service/bodyProfile.ts` (`saveBodyProfile`) | Body setup page, Finish Setup for a new profile, or when resuming a draft (no saved profile loaded) | Connected |
| Body profile – Update fields | `PATCH /users/me/body-profile` | `src/service/bodyProfile.ts` (`updateBodyProfile`) | Body setup page, Finish Setup when a saved profile was loaded: sends only the changed fields (nothing is sent if none changed) | Connected this round |
| Cart – Get | `GET /cart` | `src/service/cartApi.ts` (`fetchCart`) | Cart page; navbar count | Connected |
| Cart – Add item | `POST /cart/items` | `src/service/cartApi.ts` (`addCartItem`) | Product page, Add to cart | Connected |
| Cart – Change quantity | `PATCH /cart/items/:itemId` | `src/service/cartApi.ts` (`setCartItemQuantity`) | Cart page, quantity stepper | Connected |
| Cart – Remove item | `DELETE /cart/items/:itemId` | `src/service/cartApi.ts` (`removeCartItem`) | Cart page, Remove | Connected |
| Cart – Clear cart | `DELETE /cart` | `src/service/cartApi.ts` (`clearCart`) | Cart page (signed in), Clear cart > confirm, with Undo in the toast | Connected this round |
| Products – List | `GET /products` | `src/service/fetchProductList.ts` (`fetchProductList`) | Shop; Staff > Inventory | Connected |
| Products – Filters | `GET /products/filters` | `src/service/fetchProductFilters.ts` (`fetchProductFilters`) | Shop category pills and colour filter | Connected |
| Products – Get by slug | `GET /products/slug/:slug` | `src/service/fetchProductList.ts` (`fetchProductFull`) | Product page | Connected |
| Products – Get by id | `GET /products/:id` | `src/service/fetchProductList.ts` (`fetchProductDetail`, `fetchProductFull`) | Product page; Staff > Inventory drawer | Connected |
| Products – Create | `POST /products` | `src/service/productAdmin.ts` (`createProduct`) | Staff > Inventory, Add product | Connected |
| Products – Edit | `PATCH /products/:id` | `src/service/productAdmin.ts` (`updateProduct`, `setProductActive`) | Staff > Inventory, edit product; Archive / Restore from archive | Connected |
| Products – Bulk stock update | `PATCH /products/:id/stock` | `src/service/productAdmin.ts` (`updateStocks`) | Staff > Inventory drawer, Restock product > Save changes (and Undo) | Connected this round |
| Products – Delete | `DELETE /products/:id` | `src/service/productAdmin.ts` (`deleteProduct`) | Staff > Inventory drawer, Delete | Connected |
| Products – Restore | `POST /products/:id/restore` | none | none | Blocked-needs backend (soft-deleted products cannot be listed or read) |
| Products – Add variant | `POST /products/:id/variants` | `src/service/productAdmin.ts` (`addVariant`) | Staff > Inventory, Add variant | Connected |
| Products – Edit variant | `PATCH /products/:id/variants/:variantId` | `src/service/productAdmin.ts` (`updateVariant`) | Staff > Inventory, edit variant | Connected |
| Products – Delete variant | `DELETE /products/:id/variants/:variantId` | `src/service/productAdmin.ts` (`deleteVariant`) | Staff > Inventory, Delete variant | Connected |
| Size chart – Add | `POST /size-measurements` | `src/service/sizeMeasurements.ts` (`createSizeMeasurement`) | Staff > Measurements, Add size | Connected |
| Size chart – List | `GET /size-measurements` | `src/service/sizeMeasurements.ts` (`fetchSizeMeasurements`, `fetchCategoryMeasurements`) | Staff > Measurements; size guide; product form defaults | Connected |
| Size measurements – View row | `GET /size-measurements/:id` | `src/service/sizeMeasurements.ts` (`fetchSizeMeasurement`) | Staff > Measurements, Edit on a row: the size sheet reads the row again (skeleton, error with Try again) | Connected this round |
| Size chart – Edit | `PATCH /size-measurements/:id` | `src/service/sizeMeasurements.ts` (`updateSizeMeasurement`) | Staff > Measurements, size sheet | Connected |
| Size chart – Archive | `DELETE /size-measurements/:id` | `src/service/sizeMeasurements.ts` (`setSizeMeasurementActive`) | Staff > Measurements, Archive | Connected |
| Size chart – Restore | `POST /size-measurements/:id/restore` | `src/service/sizeMeasurements.ts` (`setSizeMeasurementActive`) | Staff > Measurements, Restore | Connected |
| Account – Get profile | `GET /users/me` | `src/service/fetchMe.ts` (`fetchMe`) | Session load; Profile | Connected |
| Account – Edit profile | `PATCH /users/me` | `src/service/updateMe.ts` (`updateMe`) | Profile > Edit profile; Body setup | Connected |
| Wishlist – Saved list | `GET /wishlist` | `src/service/wishlistApi.ts` (`fetchWishlist`) | Wishlist page (signed in): "Saved 3 Nov 2026" on each card, newest saved first | Connected this round |
| Wishlist – Get saved ids | `GET /wishlist/ids` | `src/service/wishlistApi.ts` (`fetchWishlistIds`) | Heart buttons; Wishlist page | Connected |
| Wishlist – Add | `POST /wishlist` | `src/service/wishlistApi.ts` (`addWishlistItem`) | Heart button (Shop, Product page) | Connected |
| Wishlist – Remove | `DELETE /wishlist/:productId` | `src/service/wishlistApi.ts` (`removeWishlistItem`) | Heart button; Wishlist page | Connected |
| Wishlist – Clear all | `DELETE /wishlist` | `src/service/wishlistApi.ts` (`clearWishlist`) | Wishlist page, Clear all | Connected |
| Chat – My conversation | `GET /chat/my-conversation` | `src/service/chatApi.ts` (`fetchMyConversation`) | Customer Messages page (get-or-create of the one thread); the unread badge in the account menu (`hasUnreadMessages`) | Connected this round |
| Chat – Send message (customer shortcut) | `POST /chat/my-conversation/messages` | not used | The app sends with `POST /chat/conversations/:id/messages` for customers too | Not used |
| Chat – Inbox | `GET /chat/conversations?page&limit&search&unreadOnly` | `src/service/chatApi.ts` (`fetchConversations`) | Staff > Messages inbox (server search, All and Unread chips); the sidebar unread badge (`unreadOnly=true&limit=1`, `meta.total`) | Connected this round |
| Chat – Conversation detail | `GET /chat/conversations/:id` | `src/service/chatApi.ts` (`fetchConversation`) | Chat thread header and the customer details | Connected this round |
| Chat – Messages | `GET /chat/conversations/:id/messages?limit&before` | `src/service/chatApi.ts` (`fetchMessages`) | Chat thread: newest 50, Load earlier messages (`before`), and the refetch on every (re)subscribe and every 5 seconds while Realtime is down | Connected this round |
| Chat – Send message | `POST /chat/conversations/:id/messages` | `src/service/chatApi.ts` (`sendMessage`) | Chat thread composer (customer and staff); Retry sends again (no client id, so a repeat can be stored twice) | Connected this round |
| Chat – Mark read | `POST /chat/conversations/:id/read` | `src/service/chatApi.ts` (`markConversationRead`) | Chat thread: on open and on each message from someone else that arrives while it is open | Connected this round |
| Chat – Live updates | Supabase Realtime Broadcast (private channels `chat:conversation:<id>`, `chat:inbox`, `chat:customer:<customerId>`, event `message`), sent by the backend | `src/service/chatRealtime.ts` (`subscribeToMessages`, topic helpers), `src/hooks/useChatRealtime.ts` | Thread listens on `chat:conversation:<id>`, staff inbox and unread badge on `chat:inbox`, customer unread badge on `chat:customer:<customerId>`. Payload is the same ChatMessage the REST endpoints return. Needs the `realtime.messages` authorization SQL applied. Polling fallback every 5 s while not SUBSCRIBED, safety poll every 30 s while SUBSCRIBED | Connected this round |
