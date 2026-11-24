import { useI18n as useAdminI18n } from "../lib/i18n";
import { useI18n } from "../lib/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatBusinessNumber } from "../../domain/numbering";
import { Button, Field, inputClass } from "../components/ui";
import { Checkbox } from "../components/ui/checkbox";
import { useToast } from "../components/toast";
import { ApiError, api } from "../lib/api";
import { useDemoPreview } from "./shared";

type Rule = { kind: "member" | "package" | "shipment" | "procurement"; prefix: string; length: number; nextValue: number; preview: string };
type Advanced = {
  numberingNote: string;
  numbering: Rule[];
  google: { enabled: boolean; clientId: string; secretSet: boolean; fromEnvironment: boolean; redirectUri: string; ready: boolean };
  turnstile: { enabled: boolean; siteKey: string; secretSet: boolean; fromEnvironment: boolean; login: boolean; register: boolean; reset: boolean; ready: boolean };
  customerAi: { enabled: boolean; locked: boolean };
  hiobuyPay2fa: boolean;
};

const sections = ["numbering", "authentication", "security", "features"] as const;
type Section = (typeof sections)[number];

export function AdminAdvanced() {
  const { t: tr } = useAdminI18n();
  const demo = useDemoPreview();
  const query = useQuery({ queryKey: ["admin", "advanced"], queryFn: () => api<Advanced>("/api/admin/settings/advanced") });
  const [section, setSection] = useState<Section>("numbering");
  if (query.isLoading || !query.data) return <p className="text-sm text-slate-500">{query.isLoading ? tr("Loading advanced settings…") : tr("Could not load advanced settings.")}</p>;
  return (
    <fieldset disabled={demo} className="min-w-0 border-0 p-0">
      <div className="admin-advanced-tabs mb-4" role="tablist" aria-label={tr("Advanced")}>
        {sections.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={section === item} onClick={() => setSection(item)}>
            {tr(item)}
          </button>
        ))}
      </div>
      {section === "numbering" ? <Numbering data={query.data} /> : null}
      {section === "authentication" ? <GoogleSettings data={query.data.google} /> : null}
      {section === "security" ? <SecuritySettings data={query.data} /> : null}
      {section === "features" ? <FeatureSettings data={query.data} /> : null}
    </fieldset>
  );
}

function Numbering({ data }: { data: Advanced }) {
  const { t: tr } = useAdminI18n();
  const {t}=useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [rules, setRules] = useState(data.numbering);
  const save = useMutation({
    mutationFn: () =>
      api<{ adjusted: string[] }>("/api/admin/settings/advanced/numbering", {
        method: "PUT",
        body: JSON.stringify(Object.fromEntries(rules.map((rule) => [rule.kind, { prefix: rule.prefix, length: rule.length, start: rule.nextValue }]))),
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "advanced"] });
      toast({ title: tr(result.adjusted.length ? "Numbering saved. The next number was moved past numbers already used." : "Numbering saved. Existing numbers stay unchanged."), tone: "success" });
    },
    onError: (reason) => toast({ title: tr(reason instanceof ApiError ? reason.message : "Could not save numbering."), tone: "danger" }),
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-[13px] text-slate-500">{tr(data.numberingNote)}</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {rules.map((rule) => (
          <section key={rule.kind} className="rounded-xl border border-slate-200 p-3">
            <h2 className="text-[13px] font-semibold capitalize">{t(rule.kind === "procurement" ? "Purchase order number" : `${rule.kind} number`)}</h2>
            {rule.kind === "procurement" && <p className="mt-2 text-xs text-slate-500">{t("Prefix + YYMMDD (Asia/Shanghai) + sequence. The sequence does not reset daily.")}</p>}
            <div className="mt-3 space-y-3">
              <Field label={tr("Prefix")}>
                <input className={inputClass} value={rule.prefix} maxLength={8} onChange={(event) => update(rule.kind, { prefix: event.target.value.toUpperCase() })} />
              </Field>
              <Field label={tr("Starting number")}>
                <input className={inputClass} inputMode="numeric" value={rule.nextValue} onChange={(event) => update(rule.kind, { nextValue: Number(event.target.value.replace(/\D/g, "") || 0) })} />
              </Field>
              <Field label={tr("Number length")}>
                <input className={inputClass} inputMode="numeric" value={rule.length} onChange={(event) => update(rule.kind, { length: Number(event.target.value.replace(/\D/g, "") || 0) })} />
              </Field>
              <p className="font-mono text-[13px] text-slate-600">{tr("Preview")} {formatBusinessNumber(rule.kind, rule.prefix.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8), rule.nextValue || 1, Math.min(10, Math.max(1, rule.length || 1)))}</p>
            </div>
          </section>
        ))}
      </div>
      <Button type="submit" loading={save.isPending}>{tr("Save numbering")}</Button>
    </form>
  );

  function update(kind: Rule["kind"], patch: Partial<Rule>) {
    setRules((current) => current.map((rule) => (rule.kind === kind ? { ...rule, ...patch } : rule)));
  }
}

function GoogleSettings({ data }: { data: Advanced["google"] }) {
  const { t: tr } = useAdminI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(data.enabled);
  const [clientId, setClientId] = useState(data.clientId);
  const [secret, setSecret] = useState("");
  const save = useMutation({
    mutationFn: () => api("/api/admin/settings/advanced/google", { method: "PUT", body: JSON.stringify({ enabled, clientId, clientSecret: secret }) }),
    onSuccess: async () => {
      setSecret("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "advanced"] });
      toast({ title: tr("Google sign-in saved."), tone: "success" });
    },
    onError: (reason) => toast({ title: tr(reason instanceof ApiError ? reason.message : "Could not save Google sign-in."), tone: "danger" }),
  });
  const check = useMutation({
    mutationFn: () => api<{ ok: boolean; message: string }>("/api/admin/settings/advanced/google/check", { method: "POST", body: "{}" }),
    onSuccess: (result) => toast({ title: result.message, tone: result.ok ? "success" : "danger" }),
    onError: (reason) => toast({ title: tr(reason instanceof ApiError ? reason.message : "Could not check Google."), tone: "danger" }),
  });
  return (
    <form className="max-w-xl space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <Check label={tr("Enable Google sign-in")} checked={enabled} onChange={setEnabled} />
      <Field label={tr("Google OAuth client ID")} hint={data.fromEnvironment ? tr("The client ID and secret come from the deployment environment.") : undefined}>
        <input className={inputClass} value={clientId} disabled={data.fromEnvironment} onChange={(event) => setClientId(event.target.value)} />
      </Field>
      <Field label={tr("Google OAuth client secret")} hint={data.secretSet ? tr("A secret is saved. Leave this blank to keep it.") : tr("Stored encrypted. It is not shown again.")}>
        <input className={inputClass} type="password" autoComplete="new-password" value={secret} disabled={data.fromEnvironment} onChange={(event) => setSecret(event.target.value)} />
      </Field>
      <Field label={tr("Redirect URI")}>
        <input className={inputClass} readOnly value={data.redirectUri} onFocus={(event) => event.currentTarget.select()} />
      </Field>
      <p className="text-[13px] text-slate-500">{data.ready ? tr("Google sign-in is ready for customers. It does not grant admin access.") : tr("Google sign-in stays off until the client ID and secret are valid.")}</p>
      <div className="flex gap-2">
        <Button type="submit" loading={save.isPending}>{tr("Save")}</Button>
        <Button type="button" variant="secondary" loading={check.isPending} onClick={() => check.mutate()}>{tr("Check configuration")}</Button>
      </div>
    </form>
  );
}

function SecuritySettings({ data }: { data: Advanced }) {
  const { t: tr } = useAdminI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...data.turnstile, secret: "" });
  const [pay2fa, setPay2fa] = useState(data.hiobuyPay2fa);
  const saveTurnstile = useMutation({
    mutationFn: () => api("/api/admin/settings/advanced/turnstile", { method: "PUT", body: JSON.stringify({ enabled: form.enabled, siteKey: form.siteKey, secret: form.secret, login: form.login, register: form.register, reset: form.reset }) }),
    onSuccess: async () => {
      setForm((current) => ({ ...current, secret: "" }));
      await queryClient.invalidateQueries({ queryKey: ["admin", "advanced"] });
      toast({ title: tr("Turnstile saved."), tone: "success" });
    },
    onError: (reason) => toast({ title: tr(reason instanceof ApiError ? reason.message : "Could not save Turnstile."), tone: "danger" }),
  });
  const check = useMutation({
    mutationFn: () => api<{ ok: boolean; message: string }>("/api/admin/settings/advanced/turnstile/check", { method: "POST", body: "{}" }),
    onSuccess: (result) => toast({ title: result.message, tone: result.ok ? "success" : "danger" }),
    onError: (reason) => toast({ title: tr(reason instanceof ApiError ? reason.message : "Could not check Turnstile."), tone: "danger" }),
  });
  const savePay = useMutation({
    mutationFn: () => api("/api/admin/settings/advanced/features", { method: "PUT", body: JSON.stringify({ customerAi: data.customerAi.enabled, hiobuyPay2fa: pay2fa }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast({ title: tr(pay2fa ? "HioBuy payments now require an authenticator code." : "HioBuy payment 2FA is off."), tone: "success" });
    },
    onError: (reason) => toast({ title: tr(reason instanceof ApiError ? reason.message : "Could not save the payment requirement."), tone: "danger" }),
  });
  return (
    <div className="max-w-xl space-y-8">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); saveTurnstile.mutate(); }}>
        <h2 className="text-sm font-semibold">Cloudflare Turnstile</h2>
        <Check label={tr("Enable Turnstile")} checked={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })} />
        <Field label={tr("Site key")} hint={form.fromEnvironment ? tr("The site key and secret come from the deployment environment.") : undefined}>
          <input className={inputClass} value={form.siteKey} disabled={form.fromEnvironment} onChange={(event) => setForm({ ...form, siteKey: event.target.value })} />
        </Field>
        <Field label={tr("Secret key")} hint={form.secretSet ? tr("A secret is saved. Leave this blank to keep it.") : tr("Used only on the server.")}>
          <input className={inputClass} type="password" autoComplete="new-password" value={form.secret} disabled={form.fromEnvironment} onChange={(event) => setForm({ ...form, secret: event.target.value })} />
        </Field>
        <Check label={tr("Customer login")} checked={form.login} onChange={(login) => setForm({ ...form, login })} />
        <Check label={tr("Customer registration")} checked={form.register} onChange={(register) => setForm({ ...form, register })} />
        <Check label={tr("Forgot password")} checked={form.reset} onChange={(reset) => setForm({ ...form, reset })} />
        <p className="text-[13px] text-slate-500">{tr("A bad secret does not lock the owner out of admin. Login and registration still have account rate limits.")}</p>
        <div className="flex gap-2">
          <Button type="submit" loading={saveTurnstile.isPending}>{tr("Save Turnstile")}</Button>
          <Button type="button" variant="secondary" loading={check.isPending} onClick={() => check.mutate()}>{tr("Check configuration")}</Button>
        </div>
      </form>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); savePay.mutate(); }}>
        <h2 className="text-sm font-semibold">{tr("HioBuy payments")}</h2>
        <Check label={tr("Require 2FA for HioBuy payments")} checked={pay2fa} onChange={setPay2fa} />
        <p className="text-[13px] text-slate-500">{tr("Owners and managers set up an authenticator under Team. Each payment needs its own code. Automatic tasks cannot pay without that code.")}</p>
        <Button type="submit" loading={savePay.isPending}>{tr("Save payment security")}</Button>
      </form>
    </div>
  );
}

function FeatureSettings({ data }: { data: Advanced }) {
  const { t: tr } = useAdminI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(data.customerAi.enabled);
  const save = useMutation({
    mutationFn: () => api("/api/admin/settings/advanced/features", { method: "PUT", body: JSON.stringify({ customerAi: enabled, hiobuyPay2fa: data.hiobuyPay2fa }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "advanced"] });
      await queryClient.invalidateQueries({ queryKey: ["security-public"] });
      toast({ title: tr(enabled ? "Customer assistant is on." : "Customer assistant is hidden and its API is refused."), tone: "success" });
    },
    onError: (reason) => toast({ title: tr(reason instanceof ApiError ? reason.message : "Could not save features."), tone: "danger" }),
  });
  return (
    <form className="max-w-xl space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <Check label={tr("Enable customer AI assistant")} checked={enabled} onChange={setEnabled} />
      <p className="text-[13px] text-slate-500">{data.customerAi.locked ? tr("This switch is set by the deployment environment.") : tr("Turning this off hides the customer assistant and rejects customer AI requests. Admin assistant history stays available.")}</p>
      <Button type="submit" loading={save.isPending} disabled={data.customerAi.locked}>{tr("Save")}</Button>
    </form>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  const { t: tr } = useAdminI18n();
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} aria-label={tr(label)} />
      {tr(label)}
    </label>
  );
}
