# Local verification

Completed on 23 October 2026.

- All 9 Node test-runner checks passed. These cover seeding, product validation, uploads, creation, editing, hiding, deletion, settings, local request restrictions, concurrent writes, and persistence across restart.
- JavaScript syntax checks passed.
- Verified the storefront at desktop and 390 px phone widths; no horizontal overflow or broken images remained.
- Verified the admin product table and editor at desktop and phone widths.
- Created a temporary product through the admin UI, selected a local image through the file picker, and saved it. Its image, name, stock and price appeared on the storefront.
- Edited its name and price, hid it, and verified that the public catalog no longer included it.
- Changed a homepage announcement through the settings UI and verified the storefront update, then restored the original text.
- Verified the unsaved-product-change confirmation.
- Verified category filtering, text search, price sorting, product details, adding two items to the bag, the correct subtotal, item removal, and disabled checkout.
- Verified add-to-bag feedback inside the product dialog on mobile.
- No application errors were reported in the checked browser consoles.
- Removed the temporary product and restored the original four-product sample collection.

Saved screenshots are in `previews/`: `shop-desktop.jpg`, `admin-desktop.jpg`, `shop-mobile.jpg`, and `editor-mobile.jpg`.

This is local functional verification, not a production hosting or payment audit. No checkout integration or hosting was performed.
