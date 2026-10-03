import type { InfraiCaller } from "./infrai_client.ts";

export type TenantSetup = {
  tenantId: string;
  tenantName: string;
  dispatcherEmail: string;
  workOrder: {
    id: string;
    photoUrls: string[];
    dispatchStatus: "queued" | "assigned" | "en_route" | "completed";
    technicianFollowUp: string | null;
  };
};

type CreatedUser = { user_id: string };
type CreatedKey = { key_id: string; key_secret: string };

export type TenantCredential = {
  tenantId: string;
  userId: string;
  keyId: string;
  key: string;
};

export async function provisionTenant(
  call: InfraiCaller,
  input: TenantSetup,
): Promise<TenantCredential> {
  const user = await call<CreatedUser>("/auth/user/create", {
    method: "POST",
    body: {
      email: input.dispatcherEmail,
      name: input.tenantName,
      mode: "field-service",
      metadata: {
        tenant_id: input.tenantId,
        work_order: {
          id: input.workOrder.id,
          photo_urls: input.workOrder.photoUrls,
          dispatch_status: input.workOrder.dispatchStatus,
          technician_follow_up: input.workOrder.technicianFollowUp,
        },
      },
      idempotency_key: `tenant-user-${input.tenantId}`,
    },
  });

  const key = await call<CreatedKey>("/account/keys/create", {
    method: "POST",
    body: {
      project_id: input.tenantId,
      name: `${input.tenantName} field crew`,
      scopes: ["field-service"],
      idempotency_key: `tenant-key-${input.tenantId}`,
    },
  });

  return {
    tenantId: input.tenantId,
    userId: user.user_id,
    keyId: key.key_id,
    key: key.key_secret,
  };
}

export async function offboardTenant(
  call: InfraiCaller,
  record: Pick<TenantCredential, "userId" | "keyId">,
): Promise<{ userDeleted: true; keyRevoked: true }> {
  const [userResult, keyResult] = await Promise.allSettled([
    call(`/auth/user/delete/${encodeURIComponent(record.userId)}`, { method: "DELETE" }),
    call(`/account/keys/revoke/${encodeURIComponent(record.keyId)}`, { method: "DELETE" }),
  ]);

  const failures = [userResult, keyResult].filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((result) => result.reason),
      "Tenant offboarding did not complete on both account records",
    );
  }

  return { userDeleted: true, keyRevoked: true };
}
