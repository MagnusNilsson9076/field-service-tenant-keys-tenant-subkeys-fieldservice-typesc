import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { createInfraiCaller, InfraiError } from "./infrai_client.ts";
import { offboardTenant, provisionTenant } from "./tenant_lifecycle.ts";

const workOrderSchema = z.object({
  id: z.string().min(1),
  photoUrls: z.array(z.string().url()).min(1),
  dispatchStatus: z.enum(["queued", "assigned", "en_route", "completed"]),
  technicianFollowUp: z.string().min(1).nullable(),
});

const provisionSchema = z.object({
  tenantId: z.string().min(1),
  tenantName: z.string().min(1),
  dispatcherEmail: z.string().email(),
  workOrder: workOrderSchema,
});

const offboardSchema = z.object({
  userId: z.string().min(1),
  keyId: z.string().min(1),
});

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function clientStatus(error: unknown): number {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return 400;
  if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
    return error.status;
  }
  return 502;
}

const call = createInfraiCaller();
const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/tenants/provision") {
      const input = provisionSchema.parse(await readJson(request));
      const credential = await provisionTenant(call, input);
      send(response, 201, credential);
      return;
    }

    if (request.method === "POST" && request.url === "/tenants/offboard") {
      const input = offboardSchema.parse(await readJson(request));
      send(response, 200, await offboardTenant(call, input));
      return;
    }

    send(response, 404, { error: "Route not found" });
  } catch (error) {
    send(response, clientStatus(error), {
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Field-service API listening on http://localhost:${port}`));
