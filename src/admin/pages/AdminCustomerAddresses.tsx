import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Button, ErrorState, Pagination, SearchInput } from "../components/ui";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { Page } from "../../types/api";
import { AddressesPage } from "../shared/AddressesPage";
import { AdminHeader, allows, ListEmpty, ListFrame, RowsSkeleton, useAdminAccess } from "./shared";

type Row = {id:string;customerId:string;customer:string;memberCode:string;recipient:string;phoneCode:string;phone:string;countryCode:string;city:string;street:string;isDefault:boolean};

export function AdminCustomerAddresses() {
  const { t } = useI18n();
  const [params,setParams] = useSearchParams();
  const access = useAdminAccess();
  const customer = params.get("customer");
  const q = params.get("q") ?? "", page = Number(params.get("page")) || 1;
  const query = useQuery({
    queryKey:["admin","customer-addresses","directory",{q,page}],
    enabled:!customer && allows(access.data,"customers.read"),
    queryFn:()=>api<Page<Row>>(`/api/admin/customer-addresses?${new URLSearchParams({q,page:String(page)})}`),
  });
  if (access.isPending) return <RowsSkeleton />;
  if (!allows(access.data,"customers.read")) return <ErrorState message={t("You don't have permission for this.")} />;
  if (customer) return <AddressesPage key={customer} customerId={customer} writable={allows(access.data,"customers.addresses.write")} />;
  return <div>
    <AdminHeader title={t("Customer addresses")} meta={t("Search delivery addresses or select a customer to open their address book.")}
      action={<Button to="/admin/users" variant="secondary">{t("Select customer")}</Button>} />
    <ListFrame toolbar={<SearchInput defaultValue={q} label={t("Search customer addresses")} placeholder={t("Customer, member code, recipient, phone or address")} className="mb-0 w-full sm:max-w-md" onSearch={value=>setParams(value?{q:value}:{})} />}>
      {query.isPending && <RowsSkeleton />}
      {query.isError && <ErrorState message={t("Could not load addresses.")} onRetry={()=>void query.refetch()} />}
      {query.data && !query.data.items.length && <ListEmpty title={t("No matching addresses")} body={t("Search again or select a customer to open their address book.")} />}
      {!!query.data?.items.length && <ul className="divide-y divide-line">{query.data.items.map(row=><li key={row.id} className="grid gap-3 px-5 py-4 text-sm md:grid-cols-[1fr_1fr_1.5fr_auto] md:items-center">
        <div className="min-w-0"><p className="break-words font-medium">{row.customer}</p><p className="text-xs text-slate-500">{row.memberCode}</p></div>
        <div><p>{row.recipient} {row.isDefault && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">{t("Default")}</span>}</p><p className="text-xs text-slate-500">{row.phoneCode} {row.phone}</p></div>
        <p className="break-words text-slate-600">{[row.street,row.city,row.countryCode].filter(Boolean).join(", ")}</p>
        <Link className="font-medium text-indigo-600 hover:underline" to={`?customer=${encodeURIComponent(row.customerId)}`}>{t("Open address book")}</Link>
      </li>)}</ul>}
      {query.data && <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onChange={n=>setParams({...(q?{q}:{}),page:String(n)})} />}
    </ListFrame>
  </div>;
}
