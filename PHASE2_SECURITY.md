# Phase 2 security boundary

## Decisions

- The standalone admin uses a dedicated namespace for authentication: `POST /api/admin/auth/login` and `GET /api/admin/auth/me`.
- The existing `/api/auth/*`, `/api/users`, and public product routes remain backward-compatible for the storefront. `GET /api/users` remains admin-protected but now returns an explicit safe projection rather than raw Mongoose documents.
- Bearer JWTs remain the temporary session mechanism. Production startup requires `JWT_SECRET` with at least 32 characters; local development uses a process-only ephemeral secret when no secret is configured.
- The admin origin is explicit in CORS configuration through `ADMIN_ORIGIN` (defaulting to `https://admin.gamecityelectronics.co.ke`). `STOREFRONT_ORIGIN` and `ALLOWED_ORIGINS` remain supported. Wildcard origins are not allowed.
- Upload and upload-delete routes require `protect` plus `admin`. Delete keys must match the owned `greenbits-store/<filename>.<image-extension>` contract.
- Logout is client-side token removal because the current backend has no JWT revocation endpoint.

## Protected boundaries

| Boundary | Anonymous | Normal user | Admin |
| --- | --- | --- | --- |
| `/api/admin/auth/login` | Login attempt | `403 ADMIN_ACCESS_REQUIRED` after valid credentials | Token + safe user |
| `/api/admin/auth/me` | `401` | `403` | Safe user |
| `GET /api/users` | `401` | `403` | Safe user list |
| `POST /api/upload` | `401` | `403` | Multer/upload handler |
| `POST /api/upload/delete` | `401` | `403` | Valid owned keys only |

## Verification

`test/phase2.security.test.js` covers login success/failure, non-admin rejection, safe serialization, protected user access, upload authorization, invalid media keys, CORS origins, and missing production JWT configuration. It uses mocked users and never writes to MongoDB or R2.

Full product CRUD, order/customer management, inventory mutations, category persistence, homepage merchandising, settings persistence, production DNS, and legacy `/admin` removal remain deferred.
