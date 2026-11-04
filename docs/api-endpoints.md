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
| Chat – Open conversation | `POST /conversations` | `src/service/chatApi.ts` (`openConversation`) | Order confirmation, Message staff (sends the order number; get-or-create) | Connected this round |
| Chat – Inbox | `GET /conversations` | `src/service/chatApi.ts` (`fetchConversations`) | Staff > Messages inbox (All, Mine and Taken over chips); the unread badge in the sidebar | Connected this round |
| Chat – My conversations | `GET /conversations/me` | `src/service/chatApi.ts` (`fetchMyConversations`) | Account menu > Messages; the unread badge | Connected this round |
| Chat – Conversation detail | `GET /conversations/:id` | `src/service/chatApi.ts` (`fetchConversation`) | Chat thread header, handler banner and composer (the server's canSend, canTakeOver and canRelease) | Connected this round |
| Chat – Messages | `GET /conversations/:id/messages` | `src/service/chatApi.ts` (`fetchMessages`) | Chat thread: latest 30, Load earlier messages, and the refetch after every reconnect | Connected this round |
| Chat – Send message | `POST /conversations/:id/messages` | `src/service/chatApi.ts` (`sendMessage`) | Chat thread composer; Retry resends with the same clientId; a 403 makes the thread read-only | Connected this round |
| Chat – Take over | `POST /conversations/:id/takeover` | `src/service/chatApi.ts` (`takeOverConversation`) | Chat thread banner, Take over > confirm (admin and superadmin) | Connected this round |
| Chat – Release | `POST /conversations/:id/release` | `src/service/chatApi.ts` (`releaseConversation`) | Chat thread banner, Release > confirm (admin and superadmin) | Connected this round |
| Chat – Mark read | `POST /conversations/:id/read` | `src/service/chatApi.ts` (`markConversationRead`) | Chat thread: on open and on each message that arrives while it is open | Connected this round |
| Chat – Live updates | Socket.IO `/chat` | `src/service/chatSocket.ts` (`getChatSocket`) | Chat thread, inbox and unread badge: `message:new`, `conversation:updated`, `conversation:takeover`, `conversation:release`; emits `conversation:join` and `conversation:leave` | Connected this round |
