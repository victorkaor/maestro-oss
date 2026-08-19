import { z } from "zod";

/**
 * Wire protocol between apps/web (browser) and apps/daemon (local process runner)
 * over a single WebSocket connection, multiplexed by workspaceId.
 */

export const AgentKind = z.enum(["cli", "api"]);
export type AgentKind = z.infer<typeof AgentKind>;

export const AgentStatus = z.enum([
  "idle",
  "starting",
  "running",
  "error",
  "stopped",
]);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const OutputStream = z.enum(["stdout", "stderr", "assistant", "system"]);
export type OutputStream = z.infer<typeof OutputStream>;

// ---------- Browser portal actions ----------

export const BrowserAction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("navigate"), url: z.string().url() }),
  z.object({ kind: z.literal("click"), selector: z.string() }),
  z.object({ kind: z.literal("type"), selector: z.string(), text: z.string() }),
  z.object({ kind: z.literal("screenshot") }),
  z.object({ kind: z.literal("readText"), selector: z.string().optional() }),
]);
export type BrowserAction = z.infer<typeof BrowserAction>;

export const BrowserResult = z.object({
  nodeId: z.string(),
  action: BrowserAction,
  screenshot: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
  error: z.string().optional(),
});
export type BrowserResult = z.infer<typeof BrowserResult>;

// ---------- Device portal actions ----------

export const DeviceKind = z.enum(["ios_sim", "android"]);
export type DeviceKind = z.infer<typeof DeviceKind>;

export const DeviceAction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("boot"), deviceKind: DeviceKind, udid: z.string().optional() }),
  z.object({ kind: z.literal("screenshot") }),
  z.object({ kind: z.literal("tap"), x: z.number(), y: z.number() }),
  z.object({ kind: z.literal("typeText"), text: z.string() }),
  z.object({ kind: z.literal("launchApp"), bundleId: z.string() }),
]);
export type DeviceAction = z.infer<typeof DeviceAction>;

export const DeviceResult = z.object({
  nodeId: z.string(),
  action: DeviceAction,
  screenshot: z.string().optional(),
  error: z.string().optional(),
});
export type DeviceResult = z.infer<typeof DeviceResult>;

// ---------- Push ----------

export const PushSubscriptionJson = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});
export type PushSubscriptionJson = z.infer<typeof PushSubscriptionJson>;

// ---------- Client -> Daemon ----------

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("auth"),
    token: z.string(),
    workspaceId: z.string(),
  }),
  z.object({
    type: z.literal("agent.spawn"),
    agentId: z.string(),
    nodeId: z.string(),
    kind: AgentKind,
    cliCommand: z.string().optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    systemPrompt: z.string().optional(),
    role: z.string().optional(),
  }),
  z.object({
    type: z.literal("agent.input"),
    agentId: z.string(),
    content: z.string(),
  }),
  z.object({
    type: z.literal("agent.stop"),
    agentId: z.string(),
  }),
  z.object({
    type: z.literal("routine.upsert"),
    routineId: z.string(),
    agentId: z.string(),
    cronExpr: z.string(),
    prompt: z.string(),
    enabled: z.boolean(),
  }),
  z.object({
    type: z.literal("routine.delete"),
    routineId: z.string(),
  }),
  z.object({
    type: z.literal("browser.action"),
    nodeId: z.string(),
    action: BrowserAction,
  }),
  z.object({
    type: z.literal("device.action"),
    nodeId: z.string(),
    action: DeviceAction,
  }),
  z.object({
    type: z.literal("push.subscribe"),
    subscription: PushSubscriptionJson,
  }),
  z.object({
    type: z.literal("push.test"),
    title: z.string(),
    body: z.string(),
  }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

// ---------- Daemon -> Client ----------

export const ServerMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("auth.ok") }),
  z.object({
    type: z.literal("agent.output"),
    agentId: z.string(),
    stream: OutputStream,
    chunk: z.string(),
  }),
  z.object({
    type: z.literal("agent.status"),
    agentId: z.string(),
    status: AgentStatus,
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal("routine.fired"),
    routineId: z.string(),
    agentId: z.string(),
    at: z.string(),
  }),
  z.object({
    type: z.literal("browser.result"),
    result: BrowserResult,
  }),
  z.object({
    type: z.literal("device.result"),
    result: DeviceResult,
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    code: z.string().optional(),
  }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

export function parseClientMessage(raw: unknown): ClientMessage {
  return ClientMessage.parse(raw);
}

export function parseServerMessage(raw: unknown): ServerMessage {
  return ServerMessage.parse(raw);
}
