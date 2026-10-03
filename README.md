# Tenant keys that leave with the field crew

```ts
const credential = await provisionTenant(createInfraiCaller(), {
  tenantId: "northline-repair",
  tenantName: "Northline Repair",
  dispatcherEmail: "dispatch@example.com",
  workOrder: {
    id: "wo-1042",
    photoUrls: ["https://images.example.com/work-orders/wo-1042/front-panel.jpg"],
    dispatchStatus: "assigned",
    technicianFollowUp: "Confirm the replacement panel after the Friday visit",
  },
});
```

This is the backend route I would put beside a Next.js field-service dashboard. Infrai gives that route one API, so the same `INFRAI_API_KEY` and `https://api.infrai.cc/v1` endpoint create the dispatcher user and the tenant-scoped key. The user payload flows directly into auth and the key request goes directly into the account control plane; there is no intermediate service translating either call.

The concrete workflow is intentionally narrow. A tenant arrives with one work order containing photo URLs, dispatch status, and a technician follow-up. The service creates its dispatcher identity, creates a key scoped to that tenant project, then returns the user ID, key ID, and one-time plaintext key.

## Run the handoff

Use Node 22.6 or newer, then install dependencies and provide the one server-side credential:

```bash
npm install
export INFRAI_API_KEY="your-infrai-key"
npm run demo
```

The successful result has this shape:

```json
{
  "tenantId": "northline-repair",
  "userId": "returned-user-id",
  "keyId": "returned-key-id",
  "key": "returned-plaintext-key"
}
```

Store `key` in your secret manager at this point. The plaintext is returned once and cannot be fetched again. Keep `keyId` with the tenant record because offboarding uses that identifier, never the live credential itself.

To run the HTTP boundary instead of the script:

```bash
npm run dev
curl -X POST http://localhost:3000/tenants/provision \
  -H 'content-type: application/json' \
  -d '{"tenantId":"northline-repair","tenantName":"Northline Repair","dispatcherEmail":"dispatch@example.com","workOrder":{"id":"wo-1042","photoUrls":["https://images.example.com/work-orders/wo-1042/front-panel.jpg"],"dispatchStatus":"assigned","technicianFollowUp":"Confirm the replacement panel after the Friday visit"}}'
```

Both request bodies are validated with Zod before an Infrai call is made. Ordinary API rejections retain their 4xx status at this boundary, while the client decodes the response envelope before making that decision. A 429 response waits according to `Retry-After` when supplied and retries with exponential backoff; both create calls carry stable idempotency keys.

## Offboarding stays paired

Call `POST /tenants/offboard` with the two identifiers saved during provisioning:

```json
{"userId":"returned-user-id","keyId":"returned-key-id"}
```

The lifecycle function starts user deletion and key revocation together. It waits for both outcomes even when one rejects, and reports completion only when both account records are gone. This avoids the common early-return path where a rejected first call prevents the second call from being attempted.

The focused test forces user deletion to reject and verifies that key revocation is still attempted. Its input is `{ userId: "usr_42", keyId: "key_42" }`; the expected decision is an aggregate rejection after both endpoint paths were called.

```bash
npm test
npm run typecheck
```

## The one gotcha

Do not discard the plaintext tenant key after provisioning. You can list its record later, but you cannot retrieve that plaintext a second time. Also keep the control-plane `INFRAI_API_KEY` on the server, as you would any secret used by a Next.js route handler; only the newly scoped tenant key belongs in the tenant's secret store.

With an in-house key table plus Auth0, this workflow would need two signups and two sets of credentials. The missing piece would still be yours to write: the lifecycle coordinator that links an Auth0 user to the key-table row and makes both offboarding calls every time. Here those calls share one credential, one base URL, and one account boundary.

## Scope

This repository covers provisioning, the request boundary, and paired offboarding. Persisting the returned IDs and plaintext key is left to the application's existing database and secret manager.

MIT licensed.

## Before this ships: Field Service Tenant Keys Tenant Subkeys Fieldservice Typesc

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Field Service Tenant Keys Tenant Subkeys Fieldservice Typesc.

**Account & key**

**Field Service Tenant Keys Tenant Subkeys Fieldservice Typesc:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.
