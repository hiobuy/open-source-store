import { z } from "zod";
import { clientEndpoints } from "./catalog";
import { object, ref, responseSchemas, str, type Schema } from "./responses";

export type Operation = { operationId: string; summary?: string; description?: string; tags?: string[]; parameters?: unknown[]; requestBody?: unknown; responses: Record<string, unknown>; security?: Record<string, string[]>[]; [key: string]: unknown };
export type OpenApiDocument = { openapi: string; info: { title: string; version: string; description: string }; servers: { url: string }[]; paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> }; [key: string]: unknown };
const security: Record<string, string[]>[] = [{ bearerAuth: [] }, { sessionCookie: [] }];
const media = (schema: Schema, contentType = "application/json") => ({ [contentType]: { schema } });
const publicAuth = new Set(["/sign-in/email", "/sign-up/email", "/sign-in/social", "/request-password-reset", "/reset-password", "/verify-email", "/send-verification-email", "/get-session", "/ok", "/error"]);

export function buildClientOpenApi(authSchema?: unknown): OpenApiDocument {
  const paths: OpenApiDocument["paths"] = {};
  for (const endpoint of clientEndpoints) {
    const path = endpoint.path.replace(/:([\w]+)/g, "{$1}");
    const parameters: unknown[] = [...path.matchAll(/\{(\w+)\}/g)].map(match => ({ name: match[1], in: "path", required: true, schema: str, description: match[1] === "id" ? "服务端返回的内部 id；不能从展示编号推导。" : "资源类型" }));
    for (const [name, schema] of Object.entries(endpoint.query ?? {})) parameters.push({ name, in: "query", required: ["code", "country", "session_id"].includes(name), schema });
    if (endpoint.idempotency) parameters.push({ name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", minLength: 1 }, description: "APP 应为每次业务操作生成唯一键，超时重试复用同一键。当前兼容旧客户端未传该头的调用，不应并发提交同一写操作。" });
    const response = endpoint.binary ? { description: "文件内容；不是 JSON 包装。", content: media({ type: "string", format: "binary" }, endpoint.binary) } : { description: "成功", content: media(object({ data: endpoint.response, requestId: str })) };
    const operation: Operation = {
      operationId: endpoint.id, summary: endpoint.summary, description: endpoint.description ?? "复用现有客户业务流程。返回金额以响应币种的整数最小单位表示。",
      tags: [endpoint.tag], security: endpoint.public ? [] : security, parameters,
      responses: { ...(endpoint.unavailable ? {} : { "200": response }), ...Object.fromEntries([400, 401, 403, 404, 409, 413, 429, 500, 502, 503].map(status => [String(status), { description: ({ 400: "请求校验失败", 401: "未登录或会话过期", 403: "没有权限", 404: "资源不存在或不属于当前用户", 409: "状态或幂等冲突", 413: "请求体过大", 429: "请求过于频繁", 500: "服务错误", 502: "上游服务异常", 503: "服务未配置或暂不可用" })[status], content: media(ref("Error")) }])) },
    };
    if (endpoint.body) {
      const schema = endpoint.body instanceof z.ZodType ? z.toJSONSchema(endpoint.body, { io: "input", unrepresentable: "any" }) : endpoint.body;
      operation.requestBody = { required: !endpoint.bodyOptional, content: media(schema, endpoint.media) };
    }
    (paths[path] ??= {})[endpoint.method.toLowerCase()] = operation;
  }
  const schemas: Record<string, unknown> = { ...responseSchemas };
  if (authSchema && typeof authSchema === "object") {
    const auth = authSchema as { paths?: Record<string, Record<string, Operation>>; components?: { schemas?: Record<string, unknown> } };
    // Namespace generated authentication models so they cannot collide with client DTOs.
    const rename = (value: unknown) => JSON.parse(JSON.stringify(value).replaceAll("#/components/schemas/", "#/components/schemas/Auth_"));
    for (const [name, schema] of Object.entries(auth.components?.schemas ?? {})) schemas[`Auth_${name}`] = rename(schema);
    for (const [path, methods] of Object.entries(auth.paths ?? {})) {
      for (const [method, source] of Object.entries(methods)) {
        if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
        const operation = rename(source) as Operation;
        operation.operationId = `auth_${source.operationId || `${method}_${path.replace(/\W/g, "_")}`}`;
        operation.tags = ["登录与安全"];
        for (const [status, response] of Object.entries(operation.responses)) {
          if (status.startsWith("2") && response && typeof response === "object" && !("$ref" in response)) {
            const item = response as { headers?: Record<string, unknown> };
            item.headers = { ...item.headers, "set-auth-token": { description: "仅建立或更新会话时返回的完整签名 Token；原生 APP 作为 Bearer 凭据安全保存。", schema: str } };
          }
        }
        operation.summary ??= source.description ?? `${method.toUpperCase()} ${path}`;
        operation.security = publicAuth.has(path) || path.startsWith("/reset-password/") || path.startsWith("/callback/") || path.startsWith("/two-factor/verify-") ? [] : security;
        operation.description = `${source.description ?? ""}\n认证接口采用 Better Auth 原生协议，不使用业务 data/requestId 包装。成功建立会话时从响应头 set-auth-token 读取签名 Bearer Token（不是响应 JSON 中的原始 token）。两步验证须保留临时 Cookie，完成后才获得会话。`;
        if (path === "/request-password-reset") {
          operation.summary = "忘记密码：发送重置邮件";
          operation.description = "无需登录。提交 email，可选 redirectTo 指定客户端重置密码页面；仅接受本站或 CLIENT_API_ORIGINS 中允许的来源（HTTPS，localhost 开发可用 HTTP）。不传时使用本站 /auth/reset-password。邮件经服务端校验后跳转，页面从查询参数 token 读取一次性重置凭据；失效时返回 error=INVALID_TOKEN。有效期 1 小时。无论邮箱是否存在均返回 {status:true,message:...}，该响应不是邮件已送达的保证。验证码开启时需 X-Turnstile-Token。每个限流标识 5 分钟最多申请 5 次。采用 Better Auth 原生响应，不使用 data/requestId 包装。";
        }
        if (path === "/reset-password") {
          operation.summary = "忘记密码：设置新密码";
          operation.description = "无需登录。JSON 提交 {token,newPassword}，token 来自重置邮件跳转参数，不是登录 Bearer Token；密码长度为 8～128 字符。成功返回 {status:true}，凭据只能使用一次，所有旧登录会话会被撤销，客户端需重新登录。无效、过期或已使用的凭据返回 400；频繁请求返回 429。采用 Better Auth 原生响应，不使用 data/requestId 包装。";
        }
        if (path.startsWith("/reset-password/")) {
          operation.summary = "重置邮件链接校验与跳转";
          operation.description = "无需登录，供邮件链接打开。校验一次性重置凭据后向可信 callbackURL 返回 302，携带 token；失效时携带 error=INVALID_TOKEN。打开邮件链接本身不修改密码。";
          operation.responses = { "302": { description: "跳转客户端重置密码页面", headers: { Location: { schema: str } } }, "403": { description: "不可信的回调地址" } };
        }
        if (operation.requestBody && ["/sign-in/email", "/sign-up/email", "/request-password-reset"].includes(path)) operation.parameters = [...(operation.parameters ?? []), { name: "X-Turnstile-Token", in: "header", required: false, schema: str, description: "验证码开启时必须提交有效值，先查询 /api/security/public。" }];
        (paths[`/api/auth${path}`] ??= {})[method] = operation;
      }
    }
  }
  paths["/agents/forwarding-assistant/{userId}"] = { get: {
    operationId: "connectAssistant", summary: "客户助手 WebSocket 连接", tags: ["助手"], security,
    description: "这是 Cloudflare Agents/AIChat WebSocket 协议入口，不是普通 JSON 聊天接口。userId 必须等于当前会话用户 id。原生客户端在握手头发送 Authorization；浏览器使用同站 Cookie。文本、语音及工具确认沿用 Agents 协议，写操作必须保留确认。禁止在 URL 查询参数中携带会话 Token。",
    parameters: [{ name: "userId", in: "path", required: true, schema: str }],
    responses: { "101": { description: "升级为 WebSocket；使用当前锁定的 Cloudflare Agents/AIChat 客户端协议。" }, "401": { description: "未登录或实例不属于当前用户" }, "403": { description: "客户助手未开启或来源不被允许" } },
    "x-protocol": "cloudflare-agents-ai-chat-websocket",
  } };
  return {
    openapi: "3.1.1", info: { title: "客户客户端 API", version: "1.0.0", description: "现有 Web 客户端与 APP 共用业务接口。业务 JSON 为 {data, requestId}；认证、文件和 WebSocket 保留各自协议。所有资源在服务端核验归属。管理端代购/营销内部数据不在此契约内。" },
    servers: [{ url: "/" }], paths,
    components: { schemas, securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "Signed opaque session token", description: "从认证响应头 set-auth-token 获取。不是 JWT、不是 HioBuy 密钥；与浏览器会话共享过期和撤销机制。" },
      sessionCookie: { type: "apiKey", in: "cookie", name: "better-auth.session_token", description: "浏览器及认证中间流程使用 Cookie jar；HTTPS 环境可能带 __Secure- 前缀。" },
    } },
    externalDocs: { description: "APP 接入指南与可搜索接口目录", url: "/api/docs" },
  };
}

export function searchClientDocs(spec: OpenApiDocument, input: { q: string; tag: string; method: string; page: number; pageSize: number }) {
  const q = input.q.toLowerCase();
  const all = Object.entries(spec.paths).flatMap(([path, methods]) => Object.entries(methods).map(([method, operation]) => ({ path, method: method.toUpperCase(), ...operation })));
  const rows = all.filter(r => (!input.method || r.method === input.method) && (!input.tag || r.tags?.includes(input.tag)) && (!q || `${r.path} ${r.operationId} ${r.summary} ${r.description}`.toLowerCase().includes(q)));
  return { items: rows.slice((input.page - 1) * input.pageSize, input.page * input.pageSize), total: rows.length, page: input.page, pageSize: input.pageSize };
}
