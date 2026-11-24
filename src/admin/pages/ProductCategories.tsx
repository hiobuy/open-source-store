import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, Shirt, Smartphone, ShoppingBag, Home, Gift, ImageOff } from "lucide-react";
import { Button, ErrorState, Field, LoadingBlock, inputClass } from "../components/ui";
import { Panel } from "./shared";
import { useI18n } from "../lib/i18n";
import { api, ApiError } from "../lib/api";
import { useToast } from "../components/toast";
import { localeCatalog } from "../../domain/locale";
import { categoryIcon, categoryInput, categoryImportInput, type CategoryForm, type CategoryRecord } from "../../domain/product-categories";
import type { z } from "zod";

const endpoint = "/api/admin/settings/product-categories";
const blank = (): CategoryForm => ({ names: { en: "" }, parentId: null, icon: null, keyword: "", sortOrder: 0, enabled: true, version: 0 });
const fields = (row: CategoryForm): CategoryForm => ({ names: row.names, parentId: row.parentId, icon: row.icon, keyword: row.keyword, sortOrder: row.sortOrder, enabled: row.enabled, version: row.version });
const icons = { box: Box, shirt: Shirt, smartphone: Smartphone, "shopping-bag": ShoppingBag, home: Home, gift: Gift };
function CategoryIcon({ icon }: { icon: CategoryForm["icon"] }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [icon?.value]);
  if (icon?.type === "url" && categoryIcon.safeParse(icon).success && !failed) return <img src={icon.value} alt="" referrerPolicy="no-referrer" className="size-10 rounded object-contain" onError={() => setFailed(true)} />;
  const Icon = icon?.type === "name" ? icons[icon.value as keyof typeof icons] ?? Box : ImageOff;
  return <Icon className="size-7 text-slate-400" aria-hidden="true" />;
}
type ImportData = z.infer<typeof categoryImportInput>;

export function ProductCategories({ canWrite, onDirty }: { canWrite: boolean; onDirty: (dirty: boolean) => void }) {
  const { t, locale } = useI18n(), toast = useToast(), cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [path, setPath] = useState<CategoryRecord[]>([]);
  const parentId = path.at(-1)?.id ?? null;
  const [editor, setEditor] = useState<{ id: string; form: CategoryForm } | null>(null);
  const [text, setText] = useState(""), [prepared, setPrepared] = useState<ImportData | null>(null);
  const [error, setError] = useState("");
  const dirty = !!editor || !!text;
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const query = useQuery({
    queryKey: ["admin", "product-categories", parentId, page],
    queryFn: () => api<{ items: CategoryRecord[]; total: number }>(`${endpoint}?page=${page}&pageSize=20&parentId=${parentId ?? "root"}`),
  });
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ["admin", "product-categories"] });
    await cache.invalidateQueries({ queryKey: ["product-categories"] });
  };
  const failure = (e: unknown) => {
    setError(e instanceof ApiError && e.status === 409 ? t("Category conflict. Refresh the list before editing again.") : t(e instanceof Error ? e.message : "Could not save categories."));
  };
  const save = useMutation({
    mutationFn: ({ id, form }: { id: string; form: CategoryForm }) => api<CategoryRecord>(`${endpoint}/${id}`, { method: "PUT", body: JSON.stringify(form) }),
    onSuccess: async () => { setEditor(null); setError(""); await refresh(); toast({ title: t("Category saved."), tone: "success" }); },
    onError: failure,
  });
  const upload = useMutation({
    mutationFn: (body: ImportData) => api<{ imported: number }>(`${endpoint}/import`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async result => { setText(""); setPrepared(null); setError(""); setPage(1); await refresh(); toast({ title: t("Imported {count} categories.", { count: result.imported }), tone: "success" }); },
    onError: failure,
  });
  const busy = save.isPending || upload.isPending;
  function editField<K extends keyof CategoryForm>(key: K, value: CategoryForm[K]) {
    setEditor(current => current ? { ...current, form: { ...current.form, [key]: value } } : current);
  }
  function preview() {
    setPrepared(null); setError("");
    try {
      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error(t("Import must be a JSON array."));
      const result = categoryImportInput.safeParse({ items: parsed.map(item => item && typeof item === "object" && !Array.isArray(item) ? { ...item, id: (item as { id?: unknown }).id ?? crypto.randomUUID() } : item) });
      if (!result.success) {
        setError(result.error.issues.slice(0, 5).map(issue => `${t("Row")} ${typeof issue.path[1] === "number" ? issue.path[1] + 1 : "—"} · ${issue.path.slice(2).join(".")}: ${t(issue.message)}`).join("\n"));
        return;
      }
      setPrepared(result.data);
    } catch (e) { setError(e instanceof SyntaxError ? t("Invalid JSON file.") : t(e instanceof Error ? e.message : "Invalid JSON file.")); }
  }
  function template() {
    const rootId = crypto.randomUUID();
    const body = [{ id: rootId, parentId: null, names: { en: "Clothing", "zh-Hans": "服饰", "zh-Hant": "服飾", ru: "Одежда" }, icon: { type: "name", value: "shirt" }, keyword: "服装", sortOrder: 10, enabled: true }, { id: crypto.randomUUID(), parentId: rootId, names: { en: "T-shirts", "zh-Hans": "T恤", "zh-Hant": "T恤", ru: "Футболки" }, icon: null, keyword: "T恤", sortOrder: 0, enabled: true }];
    const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "product-categories-template.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">{t("Product categories")}</h2><p className="text-sm text-slate-500">{t("Configure category names, icons and search keywords for the client API.")}</p></div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => void query.refetch()} disabled={busy}>{t("Refresh")}</Button>
        {canWrite && <Button disabled={dirty || busy} onClick={() => { setEditor({ id: crypto.randomUUID(), form: { ...blank(), parentId } }); setError(""); }}>{t("New category")}</Button>}
      </div>
    </div>
    {!canWrite && <p className="text-sm text-slate-500">{t("Read-only access")}</p>}
    {error && <div role="alert" className="whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {editor && <Panel><form className="space-y-4 p-4" onSubmit={e => {
      e.preventDefault(); const result = categoryInput.safeParse(editor.form);
      if (!result.success) { setError(result.error.issues.map(i => `${i.path.join(".")}: ${t(i.message)}`).join("\n")); return; }
      save.mutate({ id: editor.id, form: result.data });
    }}>
      <h3 className="font-semibold">{t(editor.form.version ? "Edit category" : "New category")}</h3>
      <ParentPicker value={editor.form.parentId} excludeId={editor.id} disabled={busy || !canWrite} onChange={id => editField("parentId", id)} />
      <fieldset disabled={busy || !canWrite} className="grid gap-4 sm:grid-cols-2">
        {localeCatalog.map(locale => <Field key={locale.code} label={`${locale.nativeName}${locale.code === "en" ? " *" : ""}`}>
          <input className={inputClass} maxLength={100} required={locale.code === "en"} value={editor.form.names[locale.code] ?? ""} onChange={e => {
            const names = { ...editor.form.names }; if (e.target.value) names[locale.code] = e.target.value; else delete names[locale.code]; editField("names", names);
          }} />
        </Field>)}
        <Field label={t("Search keyword")}><input className={inputClass} required maxLength={120} value={editor.form.keyword} onChange={e => editField("keyword", e.target.value)} /></Field>
        <Field label={t("Sort order")}><input type="number" className={inputClass} required min={0} max={999999} value={editor.form.sortOrder} onChange={e => editField("sortOrder", e.target.valueAsNumber)} /></Field>
        <Field label={t("Icon type")}><select className={inputClass} value={editor.form.icon?.type ?? "none"} onChange={e => editField("icon", e.target.value === "none" ? null : { type: e.target.value as "url" | "name", value: "" })}><option value="none">{t("None")}</option><option value="name">{t("Icon name")}</option><option value="url">{t("Image URL")}</option></select></Field>
        {editor.form.icon && <Field label={t(editor.form.icon.type === "url" ? "Image URL" : "Icon name")}><input className={inputClass} required list={editor.form.icon.type === "name" ? "category-icon-names" : undefined} placeholder={editor.form.icon.type === "url" ? "https://…" : "shirt"} value={editor.form.icon.value} onChange={e => editField("icon", { type: editor.form.icon!.type, value: e.target.value })} /></Field>}
        <datalist id="category-icon-names">{Object.keys(icons).map(name => <option key={name} value={name} />)}</datalist>
        <div className="flex items-center gap-3"><CategoryIcon icon={editor.form.icon} /><label className="flex items-center gap-2"><input type="checkbox" checked={editor.form.enabled} onChange={e => editField("enabled", e.target.checked)} />{t("Enabled")}</label></div>
      </fieldset>
      <p className="text-xs text-slate-500">{t("English is required as fallback. Lower sort numbers appear first. Custom icon names must be mapped by the APP.")}</p>
      <div className="flex gap-2"><Button type="submit" loading={save.isPending}>{t("Save")}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => { setEditor(null); setError(""); }}>{t("Cancel")}</Button></div>
    </form></Panel>}
    <nav aria-label={t("Category path")} className="flex flex-wrap items-center gap-2 text-sm">
      <Button variant="secondary" disabled={dirty || busy} onClick={() => { setPath([]); setPage(1); }}>{t("Root categories")}</Button>
      {path.map((row, index) => <Button key={row.id} variant="secondary" disabled={dirty || busy} onClick={() => { setPath(path.slice(0, index + 1)); setPage(1); }}>{row.names[locale] || row.names.en}</Button>)}
    </nav>
    {query.isLoading ? <LoadingBlock rows={4} /> : query.error ? <ErrorState message={t("Could not load categories.")} onRetry={() => void query.refetch()} /> : <Panel>
      {!query.data?.items.length ? <p className="p-8 text-center text-sm text-slate-500">{t("No categories yet.")}</p> : <ul className="divide-y divide-slate-100">{query.data.items.map(row => <li key={row.id} className="flex flex-wrap items-center gap-4 p-4">
        <CategoryIcon icon={row.icon} />
        <div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2 font-medium">{Object.entries(row.names).map(([locale, name]) => <span key={locale} title={locale}>{name}</span>)}</div><p className="break-all text-xs text-slate-500">{row.keyword} · {t("Sort order")}: {row.sortOrder}</p></div>
        <span className={row.enabled ? "text-sm text-emerald-700" : "text-sm text-slate-400"}>{t(row.enabled ? "Enabled" : "Disabled")}</span>
        <Button variant="secondary" disabled={busy || dirty} onClick={() => { setPath([...path, row]); setPage(1); }}>{t("View children")}</Button>
        {canWrite && <div className="flex gap-2"><Button variant="secondary" disabled={busy || dirty} onClick={() => { setEditor({ id: row.id, form: fields(row) }); setError(""); }}>{t("Edit")}</Button><Button variant="secondary" disabled={busy || dirty} onClick={() => save.mutate({ id: row.id, form: { ...fields(row), enabled: !row.enabled } })}>{t(row.enabled ? "Disable" : "Enable")}</Button></div>}
      </li>)}</ul>}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-3 text-sm"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t("Previous")}</Button><span>{page} · {t("Total")}: {query.data?.total ?? 0}</span><Button variant="secondary" disabled={page * 20 >= (query.data?.total ?? 0)} onClick={() => setPage(page + 1)}>{t("Next")}</Button></div>
    </Panel>}
    {canWrite && <Panel><div className="space-y-3 p-4">
      <h3 className="font-semibold">{t("Bulk import categories")}</h3>
      <p className="text-sm text-slate-500">{t("Import a JSON array, up to 100 new categories. Existing IDs are never overwritten; any conflict rolls back the entire import.")}</p>
      <fieldset disabled={busy || !!editor} className="space-y-3">
        <Button variant="secondary" onClick={template}>{t("Download JSON template")}</Button>
        <Field label={t("JSON file")}><input type="file" accept=".json,application/json" className={inputClass} onChange={async e => {
          const file = e.target.files?.[0]; if (!file) return;
          setPrepared(null); setError("");
          if (file.size > 1024 * 1024) { setError(t("File must be smaller than 1 MB.")); return; }
          try { setText((await file.text()).replace(/^\uFEFF/, "")); } catch { setError(t("Could not read file.")); }
        }} /></Field>
        <Field label={t("Import JSON")}><textarea className={inputClass + " min-h-40 font-mono text-xs"} maxLength={1_048_576} value={text} onChange={e => { setText(e.target.value); setPrepared(null); }} /></Field>
        <div className="flex gap-2"><Button variant="secondary" disabled={!text} onClick={preview}>{t("Validate and preview")}</Button><Button variant="secondary" onClick={() => { setText(""); setPrepared(null); setError(""); }}>{t("Clear")}</Button></div>
      </fieldset>
      {prepared && <div className="space-y-3"><p>{t("Ready to import {count} categories.", { count: prepared.items.length })}</p><ul className="max-h-64 overflow-y-auto rounded border border-line p-3 text-sm">{prepared.items.map((row, i) => <li className="break-words py-1" key={row.id}>{i + 1}. {Object.values(row.names).join(" / ")} · {t("Parent category")}: {row.parentId ?? t("Root categories")} · {row.keyword} · {row.sortOrder} · {t(row.enabled ? "Enabled" : "Disabled")}</li>)}</ul><Button loading={upload.isPending} disabled={!!editor} onClick={() => upload.mutate(prepared)}>{t("Confirm import")}</Button></div>}
    </div></Panel>}
  </div>;
}

function ParentPicker({ value, excludeId, disabled, onChange }: { value: string | null; excludeId: string; disabled: boolean; onChange: (id: string | null) => void }) {
  const { t, locale } = useI18n();
  const [path, setPath] = useState<CategoryRecord[]>([]), [page, setPage] = useState(1);
  const cursor = path.at(-1)?.id ?? null;
  const query = useQuery({
    queryKey: ["admin", "product-categories", "parent-picker", cursor, page],
    queryFn: () => api<{ items: CategoryRecord[]; total: number }>(`${endpoint}?parentId=${cursor ?? "root"}&page=${page}&pageSize=20`),
  });
  return <details className="rounded-lg border border-line p-3">
    <summary className="cursor-pointer text-sm">{t("Parent category")}: {value ? t("Nested category") : t("Root categories")} · {t("Choose parent")}</summary>
    <p className="my-2 break-all text-xs text-slate-500">{value ?? t("Root categories")}</p>
    <div className="my-2 flex flex-wrap gap-2">
      <Button type="button" variant="secondary" disabled={disabled} onClick={() => { setPath([]); setPage(1); }}>{t("Root categories")}</Button>
      {path.map((row, i) => <Button type="button" key={row.id} variant="secondary" disabled={disabled} onClick={() => { setPath(path.slice(0, i + 1)); setPage(1); }}>{row.names[locale] || row.names.en}</Button>)}
      <Button type="button" disabled={disabled || cursor === excludeId} onClick={() => onChange(cursor)}>{t("Use this level as parent")}</Button>
    </div>
    {query.isLoading ? <LoadingBlock rows={2} /> : query.error ? <ErrorState message={t("Could not load categories.")} onRetry={() => void query.refetch()} /> : <ul className="max-h-60 overflow-auto">
      {query.data?.items.filter(row => row.id !== excludeId).map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <span>{Object.values(row.names).join(" / ")}</span>
        <Button type="button" variant="secondary" disabled={disabled} onClick={() => { setPath([...path, row]); setPage(1); }}>{t("Browse children")}</Button>
      </li>)}
    </ul>}
    <div className="mt-2 flex gap-2"><Button type="button" variant="secondary" disabled={disabled || page === 1} onClick={() => setPage(page - 1)}>{t("Previous")}</Button><Button type="button" variant="secondary" disabled={disabled || page * 20 >= (query.data?.total ?? 0)} onClick={() => setPage(page + 1)}>{t("Next")}</Button></div>
  </details>;
}
