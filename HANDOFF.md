# KUPEZA WACHIKONDI — Agent Handoff

Updated 2026-11-19. Read **Current status** first. Older dated notes below are historical and may describe superseded state.

## Current status (2026-11-19)

- **2026-11-19 mobile API URL:** one public variable, `EXPO_PUBLIC_API_BASE_URL`, configures API requests and uploaded-photo URLs. `.replit` and the EAS preview APK profile set it to `https://chikondi265.zapto.org`; the mobile app and build script use the same Zapto fallback if it is unset. No API-server route or behavior changed.
- **2026-11-18 durable profile-photo uploads:** mobile sends JSON with a Base64 image field (not multipart); Express accepts requests up to 10 MB while decoded images remain capped at 5 MB. Image data is validated and saved as uniquely tagged Base64 in `profile_photos.object_key`; API profile responses return data URLs, and mobile `imageFor` renders them. New uploads are approved immediately for cross-device visibility and the upload flow refreshes `/api/v1/me`. No database migration is needed. This temporary PostgreSQL fallback can make rows and API payloads large; use Cloudinary/S3 before scaling.
- **2026-11-18 chat layout:** removed screenshot prevention. Message lists use vertical-only padding, bubbles wrap within 75% width with side margins, and the multiline composer grows to three lines, anchors at the bottom, and adjusts for the keyboard and safe area. Signed-in device behavior still needs confirmation.
- **2026-11-18 photo permission handling:** the photo picker requests media-library access before opening. A denied request now displays a Settings explanation and an Open Settings action. Retest the permission prompt on Android; the browser preview cannot verify native permission dialogs.
- Implemented the approved chat privacy work across API and mobile: edit own messages, hide a message for one participant, hard-delete own messages for everyone, clear history for one or both participants, and block/report actions. Edit/delete-for-everyone are enforced server-side within two hours; older-message attempts show “Messages older than 2 hours cannot be deleted.” New database migration `0005_material_silver_fox.sql` adds per-user message hiding and per-participant chat-clear timestamps. It is generated and committed with the code, but has **not** been applied to the live database or deployed.
- Added persistent System/Light/Dark appearance selection and typed `DELETE` confirmation before account deletion; account deletion clears local AsyncStorage and logs out. The app icon now uses the supplied CHIKONDI265 logo. Portrait orientation and Android package ID `com.nodex.chikondi265` are preserved. Chat screenshot prevention has been removed.
- Styled the payment return pages without changing payment-intent or webhook behavior. Connection list previews include the latest message time and respect per-user hidden/cleared messages. Checkout URLs gain `https://` when missing a scheme and accept explicit `http://` or `https://`; no hostname allowlist is used.
- Verification: `pnpm -w run typecheck`, API build, and `expo install --check` passed. The API and Expo workflows restarted; Expo bundled and the visitor screenshot displayed the sign-in screen. The screenshot browser is unauthenticated, so signed-in chat/settings behavior was not visually verified. No production migration, payment, or data mutation was run.
- Changed the Android package ID to `com.nodex.chikondi265` at the user's explicit request. This creates a different Android application identity from the old package; build/signing and store configuration must use the new ID. No iOS bundle identifier was changed.
- Added a latest-message preview to each connection in the API contract and connection query. The Messages list now shows the newest message text, prefixed with “You:” for messages sent by the signed-in user, instead of always showing “No messages yet.” This needs no migration. Workspace typecheck passed; after restarting the local API workflow, healthz and readyz returned 200. Code was pushed to GitHub `main` as `e549d922d54a4c4dfc74a5fd492cf82b621ecec0`; Dokploy was not triggered, so the remote preview requires deployment before it can show the new API field. The browser screenshot of `/messages` hit a repeated Expo Router “Maximum update depth exceeded” error, so signed-in UI behavior remains unverified.
- Updated the mobile checkout URL handling to normalize missing schemes to HTTPS and stop hostname blocking; checkout URLs with an `http` prefix are accepted. Diagnostic output redacts query values because payment links may contain one-time session tokens. Added an animated friendly error modal for API failures, hid native back-button labels, retained stack pushes for screen navigation, and enabled Hermes plus release minification/Android shrinking. Expo has no iOS Dart-obfuscation option, so no Flutter-specific setting was added.
- Chat now sends an auth frame over `/ws`; the API accepts it while retaining its previous query-auth handshake for compatibility. Mobile sends are optimistic, WebSocket messages reconcile by client message ID, polling starts after five seconds without a ready socket, and the socket/timers clean up on screen exit. Workspace typecheck and `git diff --check` passed; API and Expo workflows restarted, and the browser preview rendered the sign-in screen with health/readiness probes returning 200. Code commit `7a175ea15ad9b01f685f7d76269abe00b72fcc60` is pushed to GitHub `main`; Dokploy was not triggered. Signed-in WebSocket delivery was not exercised, and the API protocol change is not deployed.
- Added an isolated PayChangu webhook test path. Webhook processing now accepts injected dependencies internally, while production still supplies the real provider verifier and database repository. The new test uses a fixed test-only secret, mocked successful/pending verification, and in-memory attempt/event/connection state; it covers valid signature/unlock, replay no-op, tampered signature rejection, and no unlock on pending verification. All 3 focused tests and API typecheck pass. No production API/database/webhook was called, and these changes remain local and unpushed.
- Discovery fix commit `3878080fc97dc8fc5ee3f6fbc6d607e924a6c43f` is on GitHub `main`. Known legacy intention values such as `LONG` are normalized to the API's canonical values before response validation; regression tests, API build, library typecheck, and API typecheck passed. No production database rows were changed. Dokploy deployment is still pending.
- API client regeneration commit `255aa5000281069b76a9eb6d67117d324976d496` is on GitHub `main`. It adds/updates 16 generated files; the requested `paymentHistoryItem`, `profileIntention`, and `requestRealtimeToken200` types now exist. Code generation and library typecheck passed; Dokploy still needs a manual deployment.
- Workspace-link commit `5bb60ee5cc243f59c60a2f7ef9cff42d730a1116` restores the missing `@workspace/api-client-react` package files on GitHub `main`; `lib/*` was already listed. The filtered frozen install, API build, and final pnpm deploy step passed. Dokploy still needs a manual deployment.
- Release commit `1ee33ddcb53649003ca642397b14ee987c1dd57e` is on GitHub `main`. It includes the username/search API, the complete 61-file mobile artifact, contract/schema changes, and the prior swipe/payment-return fixes.
- Lockfile commit `f3e14e36b4b05f094c0e9ee7bb8e01fed18d7db4` is also on `main`; it changes only `pnpm-lock.yaml` to match the root workspace dependencies. Dokploy's supplied webhook returned HTTP 301 `Branch Not Match`, so this lockfile build still needs a manual deployment.
- Production migration `0004_add_username.sql` was applied to the external `chikondi265` database via a command-scoped `DATABASE_URL`; the `profiles.username` column and unique index were verified afterward.
- Dokploy is serving the release: `/api/healthz` and `/api/readyz` returned 200, and unauthenticated `GET /api/v1/search/users?q=chikondi` returned 401 `UNAUTHENTICATED` rather than 404. The configured webhook URL failed DNS resolution and the earlier supplied webhook returned 404; GitHub push auto-deploy is the observed release path.
- Swipe logging is deployed, but no real failing swipe log was available and no production swipe was replayed. The exact database error is still unknown; request a failing request ID or matching Dokploy runtime log. API typecheck/build and mobile typecheck passed; signed-in and physical-device behavior remain unverified.
- Mobile checkout uses Expo Web Browser, normalizes URLs without a scheme to HTTPS, accepts any URL beginning with `http`, and redacts query values in logs. It fetches the exact connection after the browser closes. Payment custom-scheme handlers are removed. Profile uploads use shared `API_BASE_URL`; their `Content-Type` remains because the endpoint receives raw image bytes, not multipart data.
- The previously pushed PayChangu fix `c26b23170a4ceaf27e80db6eabb062a17f2cf6bb` used HTTPS return endpoints that redirected to app links. That was the last deployment state before this turn; the signed POST webhook was not changed. No live checkout was retried.
- Native mobile auth uses Expo SecureStore and restores the token from the root provider before showing sign-in. A temporary non-401/403 startup failure now shows a retry screen and preserves the token; invalid/expired sessions still clear it. The web preview intentionally uses tab-scoped `sessionStorage`, so closing its browser tab ends that preview session. `df125d9` locally committed the auth recovery screen/provider changes; it was not pushed.
- Older notes about mobile files being uncommitted or the mobile repository being unavailable are superseded by release `1ee33ddcb53649003ca642397b14ee987c1dd57e`, which added the mobile artifact to GitHub `main`. The signed-in native restart behavior still needs device testing.
- Older checkout implementation notes below are historical; the current workspace no longer relies on payment custom-scheme links.
- Latest crash follow-up: recorded errors referenced the old `ably` import during migration. No remaining old imports were found; after restarting Expo, the sign-in screen rendered without a runtime exception and remote health/readiness both returned 200. Signed-in realtime is still unverified.
- The Expo SDK 58 app uses the remote backend `https://chikondi265.zapto.org`; do not point app requests at a local API server. Live `/api/healthz` and `/api/readyz` returned HTTP 200 on 2026-11-16, and authenticated list/profile requests in the preview returned 200.
- The user added the PayChangu variables in Dokploy and redeployed. The preview log then showed `POST /api/v1/connections/f6f0320d-be0b-4569-bd3e-f21901012fb1/payment-intents` returning HTTP 200. This confirms checkout initialization only; no completed payment, webhook, or chat unlock was verified.
- Ably token authorization previously returned HTTP 400 in the user's 2026-11-16 preview logs. The backend was migrated from `ably` v2 to `@ably/pubsub-server` and `@ably/pubsub-device` v3.1.0. The earlier Ably-specific push was API-only; later release `1ee33dd...` added the mobile artifact to the same GitHub `main` branch.
- The live database was seeded with demo accounts and related test data on 2026-11-16. Do not reset, truncate, or reseed it without explicit approval.
- Browser Ably auth now uses a bounded `fetch` callback with `credentials: 'omit'` instead of `authUrl`. The live preflight allows the preview origin but does not allow credentialed browser requests; Ably automatically enables XHR credentials for Authorization headers. Realtime delivery still needs signed-in verification.
- Historical before 2026-11-18: profile uploads used temporary local disk storage and were not durable across redeploys. New uploads use the Base64-in-PostgreSQL fallback documented in Current status.

Older registration, migration, and deployment notes below are retained as dated history. Do not treat stale seed or deployment statements as current.

## Project map

- `artifacts/kupeza-wachikondi-mobile/` — Expo Router mobile app (Expo SDK 58).
- `artifacts/api-server/` — Express API.
- `lib/` — shared API client, API specification, generated schemas, and database packages.
- Root setup is a pnpm workspace; install dependencies from the repository root with `pnpm install`.

## User’s build preference

- Use EAS Build for Android APKs. Do not switch to a local Gradle or Android Studio build.
- The user selected the existing EAS project `@symon265/kupeza-wachikondi`.
- `artifacts/kupeza-wachikondi-mobile/eas.json` has a `preview` profile configured for internal Android APK distribution.
- The mobile app config uses Expo owner `symon265` and slug `kupeza-wachikondi`.
- `extra.eas.projectId` is not set. The public EAS build page/API did not expose the UUID while unauthenticated. Obtain the project UUID from the user or an authenticated project view, then set it in `app.json`; do not guess it or request credentials.
- Preserve the Android package ID `com.nodex.chikondi265` unless the user explicitly asks to change it.

## Work completed

- Removed the explicit JSX whitespace between children in `components/ui.tsx` `Header`, which was reported as an invalid text child of a React Native `<View>`.
- Mobile runtime dependencies are declared in `artifacts/kupeza-wachikondi-mobile/package.json`; an unused workspace-only API client dependency was removed.
- Removed the local Gradle APK helper and its package script to keep the project aligned with the user’s EAS preference.

## Verification and caveats

- Mobile TypeScript check passed.
- Expo dependency alignment check passed.
- Expo Doctor passed all 21 checks when run from the mobile app directory.
- The Expo workflow starts and bundles the app. Its log includes a non-blocking React Native DevTools warning because `libglib-2.0.so.0` is unavailable in the container.
- Use the Expo mobile workflow and the mobile preview to verify the app; do not start a separate web frontend.

## EAS failure context

The entries below retain historical investigation and implementation context. Use the dated current-status block above for present-day behavior and deployment state.

The supplied transcript showed two Android builds failing during **Install dependencies** with only a generic “Unknown error”:

- `https://expo.dev/accounts/symon265/projects/kupeza-wachikondi/builds/656c595f-4b63-40a1-99ed-6cc3cea1fa77`
- `https://expo.dev/accounts/symon265/projects/kupeza-wachikondi/builds/4d21f2b4-d436-40bd-93aa-3287be079bcb`

The first attempt ran Expo Doctor in the web artifact, where Expo is not installed; the later build was launched from the monorepo root. The “Expo SDK < 41” warning in that transcript does not describe the current mobile artifact, which uses SDK 57. The public build pages expose only the failed status, not the install-phase log. Obtain the full EAS **Install dependencies** log before claiming the cloud build failure is resolved.

## Useful checks

Run from the repository root:

```sh
pnpm install
pnpm --filter @workspace/kupeza-wachikondi-mobile run typecheck
CI=1 pnpm --filter @workspace/kupeza-wachikondi-mobile exec expo install --check
```

Run Expo Doctor from the mobile app directory:

```sh
cd artifacts/kupeza-wachikondi-mobile
pnpm dlx expo-doctor@latest
```

In Replit, use the configured mobile Expo workflow so its injected port and preview environment are present.

## Bundle contents

The ZIP includes the tracked project source, assets, workspace manifests, lockfile, Replit project instructions, and this handoff note. It intentionally excludes uploaded attachments, dependency folders, caches, build output, registry/auth configuration, and secret files.

## 2026-10-27 — App upgrade initial inspection

### Findings

- The mobile app is an Expo Router demo. Profiles, matches, messages, settings, and premium state are local fixtures persisted in AsyncStorage; checkout explicitly simulates success/failure.
- The Express service currently exposes only `/api/healthz`. The Drizzle schema is empty; no application authentication, profiles, connection records, payment records, messages, or migrations exist.
- No Replit-managed PayChangu integration is connected. PayChangu's official Standard Checkout supports MWK/USD, requires a unique `tx_ref`, and instructs merchants to verify transactions server-side before granting access. Its webhook guide specifies a SHA-256 HMAC `Signature` header and re-verification against PayChangu.
- Clerk management status is `not_configured`; Replit-managed Clerk is the default project auth path, but mobile sign-in and server auth must be implemented before private app data can be enabled.
- The first managed Clerk setup attempt was rejected because the imported project's generated name is `kupeza-wachikondi-agent-handoffzip.zip`, which the service treats as containing a URL. Replit documentation says the project slug is generally permanent and a new project/remix is needed to change the identifier. The user chose to continue in a newly named Repl.
- The latest workspace status reports the API, mockup, and Expo workflows as failed. This task did not restart them or attempt app startup; the cause is unverified and the older startup notes above may be stale.
- No application code or database has been changed for this upgrade yet. No live payment or production operation has been attempted.

### Proposed implementation phases

1. Establish managed authentication and a persistent schema for users, profile data, connections, payment attempts, and messages; preserve the demo experience until real accounts can use the new path.
2. Add authenticated API operations and move real-profile, connection, and message reads/writes behind the API; remove fake user-facing records only when the backed path is ready.
3. Add configurable PayChangu checkout initiation, server-side verification, signed webhook verification, idempotent payment state transitions, and access checks. Keep live payments disabled until the merchant supplies keys and fee configuration.
4. Add persistent, authorized chat with the lightest compatible real-time transport supported by the API server; keep the existing chat interface.
5. Run focused type/startup/schema checks, start the existing workflows, and document observed results and remaining setup in this handoff.

### Confirmed business rules and remaining configuration

- The connection fee is **MWK 5,000 per connection**.
- A successful, server-verified payment opens chat immediately; this is a one-time fee per connection, not per message.
- PayChangu API and webhook secrets must be added through workspace secrets before provider calls can be tested; never paste secret values into chat or source.

### Next action

The user must create a new Repl/remix with a valid name and bring this project into it; this workspace cannot create or move Repls. In the new Repl, install workspace dependencies, retry managed Clerk setup, verify the configured workflows, then implement private profiles, payment, and chat routes using the confirmed MWK 5,000 / immediate-chat rule.

## 2026-10-27 — Imported workspace startup

### Progress

- Confirmed the Expo workflow failed before app startup because workspace dependencies were absent; API and mockup workflows also lacked their installed tools.
- Ran `pnpm install --frozen-lockfile` from the workspace root. The lockfile was current, but installation stopped at a package-firewall `403` fetching `shell-quote@1.10.0` (a transitive dependency of `react-devtools-core@6.1.5`). Dependencies were partially extracted; installation did not complete.
- `pnpm view shell-quote version` reports `1.12.0` as the current version. The initial install changed no files; a later filtered update left `shell-quote` pinned at `1.10.0` but re-resolved unrelated tooling entries in the lockfile. Those incidental lockfile changes need to be reverted before delivery.
- Tried `pnpm update --recursive shell-quote`; recursive processing also attempted the optional API workspace and stopped at a firewall `403` for `proxy-addr@2.0.7` under `express@5.2.1`. The command did not complete; verify the lockfile before the next attempt.
- Tried updating `shell-quote` within the mobile workspace using `pnpm --filter '@workspace/kupeza-wachikondi-mobile...' update shell-quote --lockfile-only`; it still attempted the pinned `1.10.0` tarball and failed with the same firewall `403`. The update command did not complete. It also reported missing optional peer `@react-native/metro-config@0.86.3`; assess after the required Expo install.
- The first filtered install was rejected before package work because the override was added as a duplicate YAML mapping. The rule is now merged into the existing workspace override block; no dependency install occurred in that attempt.
- Added `shell-quote: ^1.12.0` to the existing workspace override block and updated only its lockfile resolution. The unrelated lockfile churn caused by the failed update attempts was reverted.
- `pnpm install --filter '@workspace/kupeza-wachikondi-mobile...' --no-frozen-lockfile` completed successfully (pnpm 10.26.1). It reported missing peer `@react-native/metro-config@0.86.3`; this did not prevent the mobile app from starting.
- Restarted the Expo workflow successfully. Metro started and the web bundle completed in about 9 seconds; the preview screenshot showed the app's demo landing screen.
- Startup logs include a non-blocking React Native DevTools error because `libglib-2.0.so.0` is unavailable in this container, plus the existing React Native shadow-style deprecation warning.
- The optional API and mockup workflows remain failed from the original missing-dependency state; neither is needed for this local-data mobile demo. The API also requires `DATABASE_URL` when it is used.
- PayChangu lookup returned no Replit integration. Credentials pasted in chat were not used or added to the project; rotate them before any use.

### Next action

Finish the Expo Clerk sign-in and bearer-token integration, then verify a mobile token before adding protected API endpoints. After auth is verified, continue contract-first with the current-user/profile endpoint. PayChangu test credentials are not present; request them through Replit Secrets before starting payment-provider calls. Do not change the Android package ID or guess the EAS project UUID.

## Recommended backend architecture — fit to this app

### Decision

Keep the current pnpm monorepo and build a **modular monolith**: the Expo app calls the existing Express API; Express owns authentication, business rules, payment verification, and persistence; PostgreSQL stores application data through Drizzle. Keep the existing OpenAPI → generated Zod schemas/client workflow. Do not introduce microservices, Redis, or a separate realtime service for the first production slice.

### Existing pieces to keep

- `artifacts/api-server/` is the Express service. Today it has shared middleware and `/api/healthz`, but no product routes.
- `lib/db/` already wraps PostgreSQL with Drizzle and reads `DATABASE_URL`; `lib/db/src/schema/index.ts` is still empty.
- `lib/api-spec/openapi.yaml` is the source contract. `lib/api-zod/` and `lib/api-client-react/` are generated outputs; update the spec and run codegen rather than hand-editing generated files.
- `lib/api-client-react/src/custom-fetch.ts` supports a configurable base URL and bearer-token getter, but `artifacts/kupeza-wachikondi-mobile/components/AppProvider.tsx` currently stores demo fixtures and actions in AsyncStorage. The mobile app is not yet using product APIs.

### Server code boundaries

Use one module per domain. Keep Express route handlers thin: authenticate, validate the request, call a service, and map the result to an HTTP response. Put business rules in services and database access in repositories; do not put payment or matching decisions in route handlers.

```text
artifacts/api-server/src/
  app.ts
  index.ts
  middleware/
    require-user.ts
    error-handler.ts
  routes/
    health.ts
    v1/
      me.ts
      discovery.ts
      swipes.ts
      connections.ts
      payments.ts
      messages.ts
      safety.ts
  modules/
    profiles/
      service.ts
      repository.ts
    matching/
      service.ts
      repository.ts
    payments/
      service.ts
      paychangu-provider.ts
      repository.ts
    chat/
      service.ts
      repository.ts
```

Keep PostgreSQL tables and Drizzle schema/types in `lib/db/src/schema/`, split by domain (`users`, `profiles`, `swipes`, `connections`, `payments`, `messages`, `safety`). Use database transactions for multi-step operations such as creating a mutual match and applying a verified payment. Add production migrations; reserve the existing schema `push` command for development.

### Identity and API contract

Use the app's configured authentication provider to issue a mobile session token. The mobile client sends that token as a bearer token; Express verifies it on every protected request and maps the provider subject to an internal UUID `userId`. Never accept a caller's `userId` as authority from the request body. The handoff currently says Clerk is not configured, so verify the Replit-managed Clerk setup and Expo mobile support before implementation; keep authentication behind middleware so the API can be tested with a controlled test identity.

Continue the contract-first flow: define paths and request/response schemas in `lib/api-spec/openapi.yaml`, generate Zod validation and TypeScript client code, and validate both incoming requests and outgoing responses. Keep health at `/api/healthz`; put product endpoints under `/api/v1`. Add a centralized error handler with stable error codes, request IDs, and safe messages. Keep Pino logs, but redact authorization headers, provider keys, and payment payload secrets. Replace unrestricted `cors()` with an explicit development/production origin policy where browser clients require it.

### Initial data model
### Exact v1 tables and fields

Use PostgreSQL `uuid` primary keys with `gen_random_uuid()` unless noted. All times are `timestamptz` in UTC; `created_at` defaults to `now()`, and the service updates `updated_at` on changes. The listed status columns are `text` with database `CHECK` constraints (or equivalent Drizzle enums). `NOT NULL` is the default unless a field is explicitly marked nullable. One connection has one message thread, so v1 does not need a separate `conversations` table.

1. **`users`**
   - `id uuid PRIMARY KEY`
   - `auth_provider text NOT NULL`
   - `auth_subject text NOT NULL`
   - `status text NOT NULL DEFAULT 'active'` — `active | suspended | deleted`
   - `created_at timestamptz NOT NULL DEFAULT now()`
   - `updated_at timestamptz NOT NULL DEFAULT now()`
   - `deleted_at timestamptz NULL`
   - Constraints: `UNIQUE (auth_provider, auth_subject)`. Never store the provider session token here.

2. **`profiles`** (one row per user; `user_id` is also the primary key)
   - `user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`
   - `display_name varchar(50) NOT NULL`
   - `birth_date date NOT NULL` — private; API responses calculate age and never return this field
   - `city varchar(80) NOT NULL`
   - `country_code char(2) NOT NULL DEFAULT 'MW'`
   - `bio varchar(500) NOT NULL DEFAULT ''`
   - `interests text[] NOT NULL DEFAULT '{}'`
   - `intention varchar(40) NOT NULL`
   - `visibility_status text NOT NULL DEFAULT 'active'` — `active | paused | hidden | under_review | removed`
   - `verification_status text NOT NULL DEFAULT 'unverified'` — `unverified | pending | verified | rejected`
   - `created_at timestamptz NOT NULL DEFAULT now()`
   - `updated_at timestamptz NOT NULL DEFAULT now()`
   - Enforce the 18+ rule in server validation; do not rely on a client-supplied age. V1 stores city only, not precise coordinates.

3. **`profile_photos`**
   - `id uuid PRIMARY KEY`
   - `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`
   - `object_key text NOT NULL UNIQUE` — key in object storage; do not store image bytes in PostgreSQL
   - `position smallint NOT NULL`
   - `moderation_status text NOT NULL DEFAULT 'pending'` — `pending | approved | rejected`
   - `created_at timestamptz NOT NULL DEFAULT now()`
   - Constraints: `UNIQUE (user_id, position)`; index `user_id`.

4. **`user_preferences`** (one row per user; `user_id` is the primary key)
   - `user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`
   - `age_min smallint NOT NULL DEFAULT 18`
   - `age_max smallint NOT NULL DEFAULT 99`
   - `max_distance_km integer NOT NULL DEFAULT 100`
   - `intentions text[] NOT NULL DEFAULT '{}'`
   - `interests text[] NOT NULL DEFAULT '{}'`
   - `cities text[] NOT NULL DEFAULT '{}'`
   - `updated_at timestamptz NOT NULL DEFAULT now()`
   - Checks: `age_min >= 18`, `age_max >= age_min`, `max_distance_km > 0`.

5. **`swipes`**
   - `actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`
   - `target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`
   - `action text NOT NULL` — `like | pass | super`
   - `created_at timestamptz NOT NULL DEFAULT now()`
   - Primary key: `(actor_user_id, target_user_id)`; check that actor and target differ; index `(target_user_id, action)` for mutual-like lookup. Upsert the current action on repeat requests.

6. **`connections`** (the canonical unordered user pair)
   - `id uuid PRIMARY KEY`
   - `user_low_id uuid NOT NULL REFERENCES users(id)`
   - `user_high_id uuid NOT NULL REFERENCES users(id)`
   - `status text NOT NULL DEFAULT 'matched'` — `matched | chat_enabled | closed`
   - `matched_at timestamptz NOT NULL DEFAULT now()`
   - `chat_enabled_at timestamptz NULL`
   - `closed_at timestamptz NULL`
   - `created_at timestamptz NOT NULL DEFAULT now()`
   - `updated_at timestamptz NOT NULL DEFAULT now()`
   - Constraints: `user_low_id < user_high_id`, `UNIQUE (user_low_id, user_high_id)`, and users must differ. Index both user columns with `updated_at` for connection lists.

7. **`payment_attempts`**
   - `id uuid PRIMARY KEY`
   - `connection_id uuid NOT NULL REFERENCES connections(id)`
   - `payer_user_id uuid NOT NULL REFERENCES users(id)`
   - `provider text NOT NULL` — v1 value `paychangu`
   - `tx_ref text NOT NULL UNIQUE` — unique server-generated reference
   - `provider_transaction_id text NULL`
   - `idempotency_key text NOT NULL`
   - `amount_mwk integer NOT NULL`
   - `currency char(3) NOT NULL DEFAULT 'MWK'`
   - `status text NOT NULL DEFAULT 'pending'` — `pending | succeeded | failed | cancelled | reversed`
   - `failure_code text NULL`
   - `created_at timestamptz NOT NULL DEFAULT now()`
   - `updated_at timestamptz NOT NULL DEFAULT now()`
   - `verified_at timestamptz NULL`
   - Constraints: `amount_mwk > 0`; unique `(payer_user_id, idempotency_key)`; unique `(provider, provider_transaction_id)`; at most one `succeeded` attempt per connection (partial unique index). The server sets the configured MWK 5,000 amount; the client cannot supply it.

8. **`provider_events`** (webhook deduplication/audit; do not persist raw webhook secrets)
   - `id uuid PRIMARY KEY`
   - `provider text NOT NULL`
   - `tx_ref text NOT NULL`
   - `event_type text NOT NULL`
   - `payload_sha256 char(64) NOT NULL`
   - `signature_valid boolean NOT NULL`
   - `processing_status text NOT NULL DEFAULT 'received'` — `received | processed | ignored | failed`
   - `received_at timestamptz NOT NULL DEFAULT now()`
   - `processed_at timestamptz NULL`
   - `error_code text NULL`
   - Constraint: `UNIQUE (provider, tx_ref, event_type, payload_sha256)`.

9. **`messages`**
   - `id uuid PRIMARY KEY`
   - `connection_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE`
   - `sender_user_id uuid NOT NULL REFERENCES users(id)`
   - `client_message_id uuid NOT NULL` — stable retry key from the client
   - `body varchar(2000) NOT NULL`
   - `created_at timestamptz NOT NULL DEFAULT now()`
   - `read_at timestamptz NULL`
   - Constraints: `UNIQUE (sender_user_id, client_message_id)`; body must not be blank. Index `(connection_id, created_at, id)` for cursor pagination. The service verifies sender membership, chat access, and block state before reads/writes.

10. **`blocks`**
    - `blocker_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`
    - `blocked_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`
    - `created_at timestamptz NOT NULL DEFAULT now()`
    - Primary key: `(blocker_user_id, blocked_user_id)`; check that the users differ; index `blocked_user_id` for reverse lookups.

11. **`reports`**
    - `id uuid PRIMARY KEY`
    - `reporter_user_id uuid NOT NULL REFERENCES users(id)`
    - `reported_user_id uuid NOT NULL REFERENCES users(id)`
    - `connection_id uuid NULL REFERENCES connections(id)`
    - `category text NOT NULL` — `harassment | scam | impersonation | underage | other`
    - `details varchar(1000) NULL`
    - `status text NOT NULL DEFAULT 'open'` — `open | under_review | actioned | dismissed`
    - `created_at timestamptz NOT NULL DEFAULT now()`
    - `resolved_at timestamptz NULL`
    - `resolved_by_user_id uuid NULL REFERENCES users(id)`
    - Check that reporter and reported user differ; index `(status, created_at)` for moderation queues.

Do not add subscription or push-notification tables until those real flows are in scope. Authentication sessions remain with the identity provider. Store payment secrets only in server-side Replit Secrets, never in these tables or the Expo bundle.

### API surface and business flow

1. `GET /api/v1/me` and `PUT /api/v1/me/profile` manage the signed-in user's profile.
2. `GET /api/v1/discovery` returns paginated eligible profiles while excluding self, passed/blocked users, paused users, and ineligible accounts.
3. `POST /api/v1/swipes` records a like/pass. The server detects a mutual like transactionally and creates one connection.
4. `GET /api/v1/connections` and `GET /api/v1/connections/:id` return only connections involving the signed-in user.
5. `POST /api/v1/connections/:id/payment-intents` creates a pending payment attempt and a unique `tx_ref`. The server chooses the fee; the client cannot choose amount, currency, payer, or connection owner. Return only the provider checkout URL/reference needed by the app.
6. `POST /api/v1/payments/paychangu/webhook` checks the signature with a server-side secret, re-verifies the transaction against PayChangu, and checks `tx_ref`, amount, currency, and final status. Process events idempotently using the unique provider reference. A client redirect alone never counts as payment success.
7. Only a server-verified successful payment changes that connection to chat-enabled. The confirmed policy is MWK 5,000 once per connection; one successful payment unlocks chat for that connection immediately.
8. `GET /api/v1/connections/:id/messages?cursor=...` and `POST /api/v1/connections/:id/messages` require authenticated membership, active paid access, and no blocking state. Start with HTTP plus cursor pagination/polling; add WebSockets only if measured usage needs them.
9. `POST /api/v1/users/:id/block` and `/api/v1/users/:id/report` provide server-enforced safety actions.

### Mobile migration and environments

Keep the current demo available. Introduce an API-backed data adapter alongside the existing local demo state, then migrate one vertical slice at a time: profile read/update, discovery/swipes, connections, payment, and messages. Do not delete fixtures or AsyncStorage demo behavior until each backed flow passes end-to-end checks.

Configure a non-secret `EXPO_PUBLIC_API_BASE_URL` for the mobile client and set its base URL/token getter at app startup. The mobile bundle may contain a public API URL or auth publishable key, but **never** a database URL, PayChangu secret, or webhook secret. Store `DATABASE_URL` and rotated PayChangu test/live credentials only as server-side Replit Secrets, with separate development and production values. Keep PayChangu in test mode through end-to-end verification.

### Rollout order and release gates

1. Provision a development PostgreSQL database; add migrations, validated server configuration, DB readiness checks, and basic request/error logging.
2. Verify Expo-compatible authentication; implement the current-user/profile endpoints and one authenticated mobile request.
3. Implement discovery, swipes, and transactional connection creation with uniqueness and block checks.
4. Implement PayChangu test checkout, signature verification, provider re-check, idempotency, and the MWK 5,000 connection access rule. Never unlock chat based on a mobile callback.
5. Implement paginated chat and safety enforcement; keep polling until realtime is justified.
6. Test service rules, route authorization, migrations, duplicate requests/webhooks, and the complete mobile-to-API sandbox journey before enabling production credentials.

**Current readiness:** all 11 Drizzle tables and an initial SQL migration have been generated but not applied. The API server has a request-ID/error-handling scaffold and an injectable bearer-identity boundary; protected endpoints are intentionally absent. `DATABASE_URL` exists in development, but database connectivity has not been checked. Replit-managed Clerk was provisioned successfully, but Expo sign-in/token verification is still pending. The imported mobile demo passes typecheck, Expo dependency alignment, and all 21 Expo Doctor checks; the API and Expo workflows are running. Expo logs retain the known non-blocking React Native DevTools `libglib-2.0.so.0` warning. PayChangu public and secret test key names are now present in development secrets. A read-only lookup for a random nonexistent transaction reference returned HTTP 400, “Payment link not found”; this is indicative but does not definitively validate the credentials. No checkout or charge was created. Payment routes and webhook processing remain unimplemented, so end-to-end payment testing is still pending.

## 2026-11-17 — Manual payment verification rollback

- Restored the mobile checkout flow to `WebBrowser.openBrowserAsync`, followed by a connection refresh when the browser closes. Removed the manual **Verify Payment** button.
- Removed the manual payment-verification endpoint, supporting service/repository logic, tests, and generated API contract.
- The existing PayChangu webhook route and processing code were not changed.
- **Verification:** full workspace typecheck passed. The rollback is committed locally and has not been pushed.

## 2026-11-17 — Mobile list and chat polish

- Restyled Likes, Matches, Messages, Notifications, discovery search results, and the discovery profile card with flatter layouts, theme colors, scaled icon sizes, and circular avatars. Connection rows show the latest message and a compact timestamp instead of a chevron or empty-message placeholder.
- Chat bubbles now align by sender; new messages fade in, pending messages pulse, and failed sends shake before their optimistic entry is removed. The chat actions sheet springs into view, and primary controls use press-scale feedback.
- Added Like and Block actions to search-result details. The shared client logger now suppresses expected aborted/cancelled request noise. The status bar already followed the selected theme.
- **Verification:** `pnpm -w run typecheck` passed after restarting the Expo workflow. The unauthenticated browser screenshot shows the sign-in screen; signed-in screens and native-device interactions were not visually tested. No backend routes, database, auth logic, payment code, or new dependencies were changed.

## 2026-11-17 — Theme-aware system bars

- Kept the root Expo status-bar style tied to the resolved theme, and gave the Android app root and any displayed stack header theme-matched background/text colors. The app's navigation header remains hidden by default.
- **Verification:** `pnpm -w run typecheck` passed and Expo restarted. Native light/dark status-bar visibility was not directly tested on a device.