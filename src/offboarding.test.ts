import assert from "node:assert/strict";
import test from "node:test";
import type { InfraiCaller } from "./infrai_client.ts";
import { offboardTenant, provisionTenant } from "./tenant_lifecycle.ts";

test("provisioning maps the key response fields used by account.keys.create", async () => {
  const call: InfraiCaller = async <T>(path: string) => {
    if (path === "/auth/user/create") return { user_id: "usr_42" } as T;
    return { key_id: "key_42", key_secret: "secret_42" } as T;
  };

  const credential = await provisionTenant(call, {
    tenantId: "tenant-42",
    tenantName: "Tenant 42",
    dispatcherEmail: "chenhua@changba.com",
    workOrder: {
      id: "wo-42",
      photoUrls: ["https://example.com/photo.jpg"],
      dispatchStatus: "assigned",
      technicianFollowUp: null,
    },
  });

  assert.deepEqual(credential, {
    tenantId: "tenant-42",
    userId: "usr_42",
    keyId: "key_42",
    key: "secret_42",
  });
});

test("offboarding attempts user deletion and key revocation when one call rejects", async () => {
  const paths: string[] = [];
  const call: InfraiCaller = async <T>(path: string) => {
    paths.push(path);
    if (path.startsWith("/auth/user/delete/")) throw new Error("user deletion rejected");
    return undefined as T;
  };

  await assert.rejects(
    offboardTenant(call, { userId: "usr_42", keyId: "key_42" }),
    AggregateError,
  );
  assert.deepEqual(paths.sort(), [
    "/account/keys/revoke/key_42",
    "/auth/user/delete/usr_42",
  ]);
});

test("offboarding reports completion only after both account records succeed", async () => {
  const call: InfraiCaller = async <T>() => undefined as T;
  const result = await offboardTenant(call, { userId: "usr_42", keyId: "key_42" });
  assert.deepEqual(result, { userDeleted: true, keyRevoked: true });
});
