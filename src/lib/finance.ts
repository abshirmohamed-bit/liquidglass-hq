export type FinanceClient = { id:string; status:string; monthly_fee:number|null; setup_fee:number; start_date:string|null };
export type FinancePayment = { client_id:string; amount:number; type:string; status:string|null; due_date:string|null; paid_date:string|null };
export type FinanceTeam = { client_id:string; cost:number|null };
export const currency = (amount:number|null) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(amount ?? 0);
export function paymentStatus(payment:FinancePayment,today:string) {
 if(payment.status==='PAID') return 'PAID';
 return payment.due_date && payment.due_date<today ? 'OVERDUE' : 'PENDING';
}
export function financialSummary(clients:readonly FinanceClient[],payments:readonly FinancePayment[],team:readonly FinanceTeam[]) {
 const active=clients.filter(client=>client.status==='ACTIVE');
 const mrr=active.reduce((sum,client)=>sum+(client.monthly_fee??0),0);
 const totalRevenue=payments.filter(payment=>payment.status==='PAID').reduce((sum,payment)=>sum+payment.amount,0);
 const teamCost=team.filter(member=>active.some(client=>client.id===member.client_id)).reduce((sum,member)=>sum+(member.cost??0),0);
 const billed=payments.reduce((sum,payment)=>sum+payment.amount,0);
 return {mrr,totalRevenue,annualRevenue:mrr*12,teamCost,profit:mrr-teamCost,margin:mrr?((mrr-teamCost)/mrr)*100:0,collectionRate:billed?totalRevenue/billed*100:0,outstanding:billed-totalRevenue};
}
export function setupStatus(client:FinanceClient,payments:readonly FinancePayment[]) {
 const paid=payments.filter(payment=>payment.client_id===client.id&&payment.type==='SETUP'&&payment.status==='PAID').reduce((sum,payment)=>sum+payment.amount,0);
 return paid>=client.setup_fee?'PAID':'OUTSTANDING';
}
export function monthlyRevenue(payments:readonly FinancePayment[],today:string) {
 return Array.from({length:6},(_,index)=>{
  const date=new Date(`${today}T00:00:00Z`);date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()-5+index);
  const month=date.toISOString().slice(0,7);
  const paid=payments.filter(payment=>payment.status==='PAID'&&payment.paid_date?.startsWith(month));
  return {month,label:new Intl.DateTimeFormat('en',{month:'short',timeZone:'UTC'}).format(date),revenue:paid.reduce((sum,payment)=>sum+payment.amount,0),mrr:paid.filter(payment=>payment.type==='MONTHLY').reduce((sum,payment)=>sum+payment.amount,0)};
 });
}