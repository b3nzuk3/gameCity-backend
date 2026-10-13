# Homepage content API

Homepage content is stored in the singleton `Homepage` document (`key: default`).

- `GET /api/public/homepage`: public hero, announcement, and enabled merchandising sections.
- `GET /api/admin/homepage`: admin-only full configuration.
- `PUT /api/admin/homepage/hero`: admin-only partial hero update.
- `PUT /api/admin/homepage/announcement`: admin-only partial announcement update.

Mutation routes require bearer authentication and an admin account. They return the full admin homepage response and invalidate `cache:/api/public/homepage*` after saving. Announcement updates preserve the existing hero and sections.

## Announcement

Both read responses include `announcement` with these fields:

| Field | Type | Limit / behavior |
| --- | --- | --- |
| `enabled` | boolean | Whether the storefront shows the bar and reserves its header space |
| `text` | string | Required nonblank desktop message, up to 240 characters |
| `mobileText` | string | Up to 120 characters; empty uses `text` |
| `linkLabel` | string | Up to 80 characters; empty hides the link |
| `linkHref` | string | Up to 500 characters; empty hides the link |

Destinations may be local paths beginning with a single `/`, or absolute HTTP(S) URLs without embedded credentials. Protocol-relative links, backslashes, whitespace/control characters and other schemes are rejected. The storefront renders the CTA only when both its label and destination are present.

For an unconfigured homepage or older document without an announcement, the API supplies the existing storefront defaults: desktop message `Gaming PCs, components & accessories • Delivery across Kenya`, mobile message `Delivery across Kenya`, and `Shop now` linking to `/category/all`. No production backfill is needed. Disabled announcements retain their content in both responses and send `enabled: false`; hiding is handled by the storefront.

## Hero serialization

Mongoose nested documents must be converted with `toObject()` before merging with fallback values. Spreading the hydrated subdocument directly leaks Mongoose internals and substitutes default content for saved values. The optional secondary CTA supports empty label/link values; primary links must remain valid.

## Verification

Run `npm test`. Hero regressions use actual hydrated Mongoose documents. Announcement tests exercise HTTP authentication, validation, save/response/read-back, disabling, backward-compatible defaults, and preservation of unrelated homepage content. The HTTP tests use an isolated in-memory persistence adapter around real Mongoose documents, not a production MongoDB connection.
