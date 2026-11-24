import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../index";
import { parseInput } from "../operations-input";
import { buildClientOpenApi, searchClientDocs } from "./openapi";

export const clientCapabilities = {
  apiVersion: "1.0.0", openapi: "/api/openapi.json", docs: "/api/docs",
  auth: { signIn: "/api/auth/sign-in/email", session: "/api/auth/get-session", signOut: "/api/auth/sign-out", requestPasswordReset: "/api/auth/request-password-reset", resetPassword: "/api/auth/reset-password", tokenHeader: "set-auth-token" },
  assistant: { pathTemplate: "/agents/forwarding-assistant/{userId}", protocol: "cloudflare-agents-ai-chat-websocket" },
  currencySource: "/api/locale",
  features: ["exchange-rates", "account", "notifications", "warehouse", "packages", "claims", "addresses", "shipping-quotes", "consolidation", "shipments", "wallet", "stripe-checkout", "bank-transfers", "invoice-profiles", "documents", "photos", "assistant", "purchase-products", "purchase-orders", "cart", "product-favorites", "favorite-status", "shop-subscriptions", "browsing-history", "seller-products", "image-search", "product-categories"],
};
export const clientDocs = new Hono<AppEnv>();
clientDocs.get("/client/capabilities", c => c.json({ data: clientCapabilities, requestId: c.get("requestId") }));
clientDocs.get("/openapi.json", async c => {
  const spec = buildClientOpenApi(await c.get("auth").api.generateOpenAPISchema());
  c.header("Cache-Control", "no-store");
  return c.json(spec);
});
clientDocs.get("/docs/endpoints", async c => {
  const input = parseInput(z.object({ q: z.string().trim().max(200).default(""), tag: z.string().max(50).default(""), method: z.enum(["", "GET", "POST", "PATCH", "PUT", "DELETE"]).default(""), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }), c.req.query());
  return c.json({ data: searchClientDocs(buildClientOpenApi(await c.get("auth").api.generateOpenAPISchema()), input), requestId: c.get("requestId") });
});
clientDocs.get("/docs", c => {
  c.header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  return c.html(docsHtml);
});
clientDocs.get("/docs/ui.js", c => c.body(docsScript, 200, { "Content-Type": "application/javascript; charset=utf-8", "X-Content-Type-Options": "nosniff" }));

const docsHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>客户端 API 文档</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#18243b;font:14px/1.65 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1440px;margin:auto;padding:30px 20px}h1{font-size:28px;margin:0}h2{font-size:18px}a{color:#364ecc}header,section,article{background:white;border:1px solid #e2e7ef;border-radius:12px;padding:20px;margin-bottom:16px}header p{color:#586477}.actions,.filters{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.filters{position:sticky;top:0;background:#f5f7fb;padding:12px 0;z-index:1}input,select,button{font:inherit;border:1px solid #cbd5e1;border-radius:8px;padding:9px 12px;background:white;color:inherit}input{flex:1;min-width:180px}button{cursor:pointer}pre{overflow:auto;padding:14px;background:#f1f4f8;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 ui-monospace,Consolas,monospace}code{overflow-wrap:anywhere}.method{color:#075985;font-weight:700;margin-right:10px}.path{font-family:ui-monospace,Consolas,monospace;overflow-wrap:anywhere}summary{cursor:pointer;font-weight:600}small,.muted{color:#64748b}#error{color:#b42318}article h2{margin:6px 0}label{display:flex;gap:8px;align-items:center}details{margin-top:12px}#results{overflow-wrap:anywhere}@media(max-width:600px){main{padding:16px 12px}header,section,article{padding:14px}.filters{position:static}input{width:100%}}
.docs-layout{display:grid;grid-template-columns:320px minmax(0,1fr);gap:24px;align-items:start}.sidebar{position:sticky;top:20px;background:white;border:1px solid #e2e7ef;border-radius:12px;padding:16px;max-height:calc(100vh - 40px);overflow-y:auto}.sidebar h2{margin:0 0 12px;font-size:14px;color:#64748b}.group-list{display:flex;flex-direction:column;gap:4px}.group-button{display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;text-align:left;border:0;background:transparent;padding:10px 12px}.group-button:hover{background:#f1f4f8}.group-button[aria-pressed="true"]{background:#eef2ff;color:#364ecc;font-weight:600}.group-count{font-size:12px;border-radius:6px;padding:0 7px;background:#f1f4f8;color:#64748b}.docs-content{min-width:0}.content-title{margin:0;font-size:22px}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #5263da;outline-offset:3px}@media(max-width:760px){.docs-layout{grid-template-columns:1fr;gap:16px}.sidebar{position:static;max-height:none;padding:12px}.group-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.group-button{padding:8px;font-size:13px}.filters{position:static}}
.sidebar .filters{position:static;background:transparent;padding:0;gap:8px}.sidebar input{width:100%;min-width:0}.sidebar label{font-size:12px}.sidebar #status{font-size:12px;color:#64748b}.group-list{display:block}.api-group{margin:6px 0}.api-group>summary{padding:10px 6px;border-radius:6px}.api-group>summary:hover{background:#f1f4f8}.api-group .group-count{float:right}.endpoint-list{padding:4px 0 6px 12px;border-left:1px solid #e2e7ef;margin-left:9px}.endpoint-button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:9px;margin:3px 0;line-height:1.5}.endpoint-button:hover{background:#f1f4f8}.endpoint-button[aria-current="true"]{background:#eef2ff;box-shadow:inset 3px 0 #5263da;color:#364ecc}.endpoint-name{display:block;font-size:13px}.endpoint-meta{display:block;font-size:10px;overflow-wrap:anywhere;margin-top:4px}.endpoint-meta .method{margin-right:5px}.content-title{margin-bottom:16px}#results article>details{margin-top:20px}@media(max-width:760px){.sidebar{max-height:45vh;overflow-y:auto}.group-list{display:block}}
</style></head><body><main><header><h1>客户端 API 文档</h1><p>Web 与 APP 共用业务接口 · OpenAPI 3.1.1 · 账号、包裹、运单、支付、单据及助手</p><div class="actions"><a href="/api/openapi.json" download="client-openapi.json">下载 OpenAPI JSON</a><a href="/api/docs/endpoints">文档查询 API</a><a href="/api/client/capabilities">接入能力</a></div></header>
<div class="docs-layout"><aside class="sidebar"><h2>接口分组</h2><div class="filters"><input id="q" type="search" aria-label="搜索接口" placeholder="搜索名称或路径"><label>方法<select id="method"><option value="">全部</option><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></label></div><p id="status" role="status">正在加载接口定义…</p><nav id="groups" class="group-list" aria-label="接口分组"><span class="muted">正在加载分组…</span></nav></aside><div class="docs-content"><section id="intro"><details><summary>APP 接入步骤与调用约定</summary><ol><li>调用 <code>GET /api/security/public</code> 获取登录方式和验证码配置。</li><li>通过 <code>POST /api/auth/sign-in/email</code> 登录；需要时完成邮箱验证或两步验证。认证中间步骤使用 Cookie jar。</li><li>从响应头 <code>set-auth-token</code> 读取签名会话 Token，存入系统安全存储。业务请求发送 <code>Authorization: Bearer &lt;token&gt;</code>。</li><li>业务响应为 <code>{ data, requestId }</code>，失败为 <code>{ error: { code, message, details }, requestId }</code>。认证、图片、PDF、WebSocket 不使用这个包装。</li><li>会话过期或撤销后重新登录。调用 <code>/api/auth/sign-out</code> 注销，支持查询和撤销设备会话。</li></ol><p>金额使用整数最小单位，币种从响应读取。运单创建、钱包支付重试复用 <code>Idempotency-Key</code>，不要并发重复提交。Stripe 跳转成功不是到账依据，应查询支付状态。APP 下载照片或 PDF 时同样携带认证头。</p><p>原生 APP 不受浏览器 CORS 限制；其他网页来源由服务端 <code>CLIENT_API_ORIGINS</code> 精确配置。OAuth、支付和邮件链接继续使用现有 HTTPS 浏览器流程。助手使用 Cloudflare Agents/AIChat WebSocket 协议，需要实现相应文本、语音和确认消息，不能当作普通 JSON 聊天接口调用。</p><p class="muted">此目录涵盖已实现的客户功能。客户可查询商品、创建代购申请并支付账单；远端采购由后台确认。内部售后台账、营销配置及外部回调不作为客户接口公开。文档页面只查询定义，不执行付款或其他写操作。</p></details></section><h2 id="group-title" class="content-title">全部接口</h2>
<p id="error" role="alert"></p><button id="retry" hidden>重新加载</button><div id="results"></div></div></div></main><script src="/api/docs/ui.js" defer></script></body></html>`;

const docsScript = `
const el=id=>document.getElementById(id);
const initial=new URLSearchParams(location.search);
let spec,rows=[],selectedId=initial.get('operation')||'';
const openGroups=new Set();
function pre(parent,value){const p=document.createElement('pre');p.textContent=JSON.stringify(value,null,2);parent.append(p);}
function detail(parent,title,value){if(value===undefined)return;const d=document.createElement('details'),s=document.createElement('summary');d.open=true;s.textContent=title;d.append(s);pre(d,value);parent.append(d);}
function expand(value,depth=0,seen=[]){if(!value||typeof value!=='object'||depth>12)return value;if(value.$ref&&value.$ref.startsWith('#/components/schemas/')){const name=value.$ref.split('/').pop();if(seen.includes(name))return value;return expand(spec.components.schemas[name]||value,depth+1,[...seen,name]);}if(Array.isArray(value))return value.map(v=>expand(v,depth+1,seen));return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,expand(v,depth+1,seen)]));}
function saveLocation(){const params=new URLSearchParams();if(el('q').value)params.set('q',el('q').value);if(el('method').value)params.set('method',el('method').value);if(selectedId)params.set('operation',selectedId);history.replaceState(null,'',location.pathname+(params.size?'?'+params:''));}
function renderDocument(){
  const r=rows.find(row=>row.operationId===selectedId);
  el('results').replaceChildren();el('intro').hidden=Boolean(r);
  el('group-title').textContent=r?(r.tags||[]).join(' / '):'选择接口查看文档';
  for(const button of el('groups').querySelectorAll('.endpoint-button'))button.setAttribute('aria-current',String(button.dataset.operation===selectedId));
  if(!r){saveLocation();return;}
  const a=document.createElement('article'),h=document.createElement('h2'),m=document.createElement('span'),path=document.createElement('span'),p=document.createElement('p'),sub=document.createElement('small');
  m.className='method';m.textContent=r.method;path.className='path';path.textContent=r.path;h.textContent=r.summary||r.operationId;
  sub.textContent=r.operationId+' · '+(r.security?.length?'需认证':'公开或认证流程入口');p.textContent=r.description||'';a.append(m,path,h,sub,p);
  detail(a,'认证方式',r.security?.length?r.security:'此接口公开或属于认证流程入口，详见接口说明。');
  detail(a,'路径、查询及请求头参数',r.parameters||[]);
  detail(a,'请求体字段',expand(r.requestBody));detail(a,'响应及错误字段',expand(r.responses));
  const example='curl -X '+r.method+' "'+location.origin+r.path+'"'+(r.security?.length?' -H "Authorization: Bearer <session-token>"':'');
  detail(a,'请求示例（请替换路径参数；请求体按上方定义填写）',example);
  el('results').append(a);saveLocation();
}
function renderNavigation(){
  const q=el('q').value.trim().toLowerCase(),method=el('method').value;
  const found=rows.filter(r=>(!method||r.method===method)&&(!q||(r.path+' '+r.operationId+' '+r.summary+' '+r.description).toLowerCase().includes(q)));
  el('status').textContent=found.length+' 个接口 / 共 '+rows.length+' 个';el('groups').replaceChildren();
  for(const tag of [...new Set(found.flatMap(r=>r.tags||[]))]){
    const items=found.filter(r=>r.tags?.includes(tag)),group=document.createElement('details'),summary=document.createElement('summary'),label=document.createElement('span'),count=document.createElement('span'),list=document.createElement('div');
    group.className='api-group';group.dataset.tag=tag;group.open=Boolean(q||method)||openGroups.has(tag);label.textContent=tag;count.className='group-count';count.textContent=String(items.length);summary.append(label,count);list.className='endpoint-list';
    group.addEventListener('toggle',()=>{if(!el('q').value&&!el('method').value){if(group.open)openGroups.add(tag);else openGroups.delete(tag);}});
    for(const r of items){
      const button=document.createElement('button'),name=document.createElement('span'),meta=document.createElement('span'),verb=document.createElement('span'),path=document.createElement('span');
      button.type='button';button.className='endpoint-button';button.dataset.operation=r.operationId;button.setAttribute('aria-current',String(r.operationId===selectedId));name.className='endpoint-name';name.textContent=r.summary||r.operationId;meta.className='endpoint-meta';verb.className='method';verb.textContent=r.method;path.textContent=r.path;meta.append(verb,path);button.append(name,meta);
      button.addEventListener('click',()=>{selectedId=r.operationId;renderDocument();});list.append(button);
    }
    group.append(summary,list);el('groups').append(group);
  }
  if(!found.length)el('groups').textContent='没有匹配的接口。';saveLocation();
}
async function load(){
  el('error').textContent='';el('retry').hidden=true;
  try{
    const res=await fetch('/api/openapi.json');if(!res.ok)throw new Error('接口定义加载失败（'+res.status+'）');spec=await res.json();
    rows=Object.entries(spec.paths).flatMap(([path,methods])=>Object.entries(methods).filter(([m])=>['get','post','put','patch','delete'].includes(m)).map(([m,o])=>({...o,path,method:m.toUpperCase()})));
    const selected=rows.find(r=>r.operationId===selectedId)||rows.find(r=>r.tags?.includes(initial.get('tag')))||rows[0];selectedId=selected?.operationId||'';
    for(const tag of selected?.tags||[])openGroups.add(tag);
    renderNavigation();renderDocument();
  }catch(error){el('status').textContent='暂时无法显示接口定义';el('groups').textContent='接口目录加载失败';el('error').textContent=error.message;el('retry').hidden=false;}
}
el('q').value=initial.get('q')||'';el('method').value=initial.get('method')||'';
for(const id of ['q','method'])el(id).addEventListener('input',renderNavigation);
el('retry').addEventListener('click',load);load();
`;
