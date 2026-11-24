export type PurchaseProgress = { state:string; paymentStatus:string; remoteId?:string|null; remoteCostCnyCents?:number|null };
export type PushPayApi = {
  balance:()=>Promise<number>;
  create:()=>Promise<PurchaseProgress>;
  sync:()=>Promise<PurchaseProgress>;
  pay:()=>Promise<PurchaseProgress>;
};
/** User-confirmed sequence. Never retries a write; persistent backend attempts handle duplicate requests. */
export async function pushAndPayPurchase(limitCnyCents:number, api:PushPayApi):Promise<string> {
  if(!Number.isSafeInteger(limitCnyCents)||limitCnyCents<0)throw new Error("Invalid purchase amount.");
  const available=await api.balance();
  if(!Number.isSafeInteger(available)||available<limitCnyCents) return "Insufficient HioBuy balance. Order was not submitted.";
  const created=await api.create();
  if(created.state!=="created"||!created.remoteId) return "Submission needs review. No payment was requested.";
  // A fresh detail read confirms current cost and recovers a previously completed submission.
  const current=await api.sync();
  if(current.state!=="created")return "Order submitted; payment requires review.";
  if(current.paymentStatus==="paid")return "Purchase submitted and paid.";
  if(current.paymentStatus!=="unpaid")return "Order submitted; payment requires review.";
  if(current.remoteCostCnyCents==null||current.remoteCostCnyCents>limitCnyCents)return "Order submitted; cost changed. Review before payment.";
  const result=await api.pay();
  return result.paymentStatus==="paid"?"Purchase submitted and paid.":"Order submitted; payment is unconfirmed. Refresh remote status before retrying.";
}
