import { createInfraiCaller } from "./infrai_client.ts";
import { provisionTenant } from "./tenant_lifecycle.ts";

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

console.log(JSON.stringify(credential, null, 2));
