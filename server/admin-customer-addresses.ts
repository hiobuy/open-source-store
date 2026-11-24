import { Hono } from "hono";
import { count, desc, eq, like, or } from "drizzle-orm";
import { z } from "zod";
import type { AdminEnv } from "./admin";
import { addresses, user } from "./db/schema";
import { listAddresses, saveAddress, deleteAddress, setDefaultAddress } from "./data";
import { addressSchema } from "./client-api/requests";
import { parseInput } from "./operations-input";
import { AppError } from "./errors";
import { recordAudit } from "./staff";

export const customerAddressesAdmin = new Hono<AdminEnv>();
customerAddressesAdmin.get("/customer-addresses", async c => {
  const {page,q} = parseInput(z.object({page:z.coerce.number().int().min(1).max(1000000).default(1),q:z.string().trim().max(160).default("")}), c.req.query());
  const db = c.get("db"), size = 25, pattern = `%${q}%`;
  const filter = q ? or(...[user.name,user.memberCode,user.email,addresses.name,addresses.phone,addresses.city,addresses.addressLine1].map(column => like(column,pattern))) : undefined;
  const [items,[total]] = await Promise.all([
    db.select({id:addresses.id,customerId:user.id,customer:user.name,memberCode:user.memberCode,recipient:addresses.name,phoneCode:addresses.phoneCode,phone:addresses.phone,countryCode:addresses.countryCode,city:addresses.city,street:addresses.addressLine1,isDefault:addresses.isDefault})
      .from(addresses).innerJoin(user,eq(user.id,addresses.userId)).where(filter).orderBy(desc(addresses.updatedAt),desc(addresses.id)).limit(size).offset((page-1)*size),
    db.select({n:count()}).from(addresses).innerJoin(user,eq(user.id,addresses.userId)).where(filter),
  ]);
  return c.json({data:{items,page,pageSize:size,total:total.n},requestId:c.get("requestId")});
});

const book = "/users/:customerId/addresses";
async function customer(db: AdminEnv["Variables"]["db"], id: string) {
  const [owner] = await db.select({id:user.id,name:user.name,memberCode:user.memberCode}).from(user).where(eq(user.id,id));
  if (!owner) throw new AppError("NOT_FOUND","Customer not found.",404);
  return owner;
}
customerAddressesAdmin.get(book, async c => {
  const db = c.get("db"), owner = await customer(db,c.req.param("customerId"));
  return c.json({data:{customer:owner,addresses:await listAddresses(db,owner.id)},requestId:c.get("requestId")});
});
const fields = addressSchema.omit({id:true});
customerAddressesAdmin.post(book, async c => {
  const db = c.get("db"), owner = await customer(db,c.req.param("customerId"));
  const address = await saveAddress(db,owner.id,parseInput(fields,await c.req.json()));
  await recordAudit(db,c.get("user"),"customer.address.create",address.id,{customerId:owner.id});
  return c.json({data:address,requestId:c.get("requestId")});
});
customerAddressesAdmin.patch(`${book}/:id`,async c => {
  const db=c.get("db"), owner=c.req.param("customerId");
  const address=await saveAddress(db,owner,{...parseInput(fields,await c.req.json()),id:c.req.param("id")});
  await recordAudit(db,c.get("user"),"customer.address.update",address.id,{customerId:owner});
  return c.json({data:address,requestId:c.get("requestId")});
});
customerAddressesAdmin.delete(`${book}/:id`,async c => {
  const db=c.get("db"), owner=c.req.param("customerId"), id=c.req.param("id");
  const result=await deleteAddress(db,owner,id);
  await recordAudit(db,c.get("user"),"customer.address.delete",id,{customerId:owner});
  return c.json({data:result,requestId:c.get("requestId")});
});
customerAddressesAdmin.post(`${book}/:id/default`,async c => {
  const db=c.get("db"), owner=c.req.param("customerId"), id=c.req.param("id");
  const result=await setDefaultAddress(db,owner,id);
  await recordAudit(db,c.get("user"),"customer.address.default",id,{customerId:owner});
  return c.json({data:result,requestId:c.get("requestId")});
});
