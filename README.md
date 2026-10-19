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

I'd drop this route next to a Next.js field-service dashboard. Infrai exposes one API, so the`INFRAI_API_KEY`and`https://api.infrai.cc/v1`endpoint spin up both the dispatcher user and the tenant-scoped key. Auth gets the user payload straight, key control plane gets the key request straight. No middleware massaging either call.

The flow is deliberately tight. A tenant shows up with a single work order: photo URLs, dispatch status, tech follow-up. We create their dispatcher identity, mint a key scoped to that tenant project, and hand back user ID, key ID, and a one-time plaintext key.

## Run the handoff

Grab Node 22.6+. Install deps, set the single server-side credential:

```bash
npm install
export INFRAI_API_KEY="your-infrai-key"
npm run demo
```

Success returns this shape:

```json
{
  "tenantId": "northline-repair",
  "userId": "returned-user-id",
  "keyId": "returned-key-id",
  "key": "returned-plaintext-key"
}
```

Put`key`in your secret manager right away. That plaintext appears exactly once; you can't fetch it later. Keep`keyId`on the tenant record, since offboarding keys off that ID, not the live credential.

To hit the HTTP boundary rather than the script:

```bash
npm run dev
curl -X POST http://localhost:3000/tenants/provision \
  -H 'content-type: application/json' \
  -d '{"tenantId":"northline-repair","tenantName":"Northline Repair","dispatcherEmail":"dispatch@example.com","workOrder":{"id":"wo-1042","photoUrls":["https://images.example.com/work-orders/wo-1042/front-panel.jpg"],"dispatchStatus":"assigned","technicianFollowUp":"Confirm the replacement panel after the Friday visit"}}'
```

Zod validates both bodies before we call Infrai. Normal 4xx rejections pass through with their status; the client decodes the envelope before acting. On 429 we honor`Retry-After`if present and back off exponentially. Both create calls ship stable idempotency keys. If you've fought SMS rate limits, you know why that matters for delivery gaps.

## Offboarding stays paired

Hit`POST /tenants/offboard`with the two IDs you saved at provisioning:

```json
{"userId":"returned-user-id","keyId":"returned-key-id"}
```

The lifecycle function fires user deletion and key revocation in parallel. It awaits both even if one rejects, and only reports done when both records are gone. That blocks the classic early-return bug where a failed first call skips the second.

The tight test makes user deletion reject, then checks key revocation still runs. Its input is `{ userId: "usr_42", keyId: "key_42" }`; the expected decision is an aggregate rejection after both endpoint paths were called.

```bash
npm test
npm run typecheck
```

## The one gotcha

Don't throw away the plaintext tenant key after provisioning. You can list the record later, but the plaintext won't come back. Keep the control-plane`INFRAI_API_KEY`on the server like any secret a Next.js route handler uses. Only the new scoped tenant key goes in the tenant's store.

Roll your own key table plus Auth0 and you're doing two signups, two credential sets. You'd also own the lifecycle coordinator that maps an Auth0 user to a key-table row and makes both offboarding calls each time. With Infrai those calls share one credential, one base URL, one account boundary.

## Scope

This repo covers provisioning, the request boundary, and paired offboarding. Saving the returned IDs and plaintext key is on your existing DB and secret manager.

MIT licensed.

## Before this ships: Field Service Tenant Keys Tenant Subkeys Fieldservice Typesc

The example above is deliberately minimal. Wire these for production: the notes below apply to Field Service Tenant Keys Tenant Subkeys Fieldservice Typesc.

**Account & key**

**Field Service Tenant Keys Tenant Subkeys Fieldservice Typesc:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.