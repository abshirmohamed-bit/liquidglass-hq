import {describe,it,expect} from 'vitest';
import {financialSummary,paymentStatus,setupStatus,monthlyRevenue} from '@/lib/finance';
const clients=[{id:'active',status:'ACTIVE',monthly_fee:10000,setup_fee:30000,start_date:'2026-01-01'},{id:'churned',status:'CHURNED',monthly_fee:20000,setup_fee:30000,start_date:'2026-01-01'}] as const;
const payments=[{client_id:'active',amount:30000,type:'SETUP',status:'PAID',due_date:'2026-10-01',paid_date:'2026-10-02'},{client_id:'active',amount:10000,type:'MONTHLY',status:'PENDING',due_date:'2026-10-01',paid_date:null}] as const;
describe('Finance single source of truth',()=>{
 it('sums only active clients for MRR',()=>expect(financialSummary(clients,payments,[]).mrr).toBe(10000));
 it('annualizes current MRR',()=>expect(financialSummary(clients,payments,[]).annualRevenue).toBe(120000));
 it('counts only collected payments as revenue',()=>expect(financialSummary(clients,payments,[]).totalRevenue).toBe(30000));
 it('subtracts active team costs from monthly revenue',()=>expect(financialSummary(clients,payments,[{client_id:'active',cost:3000},{client_id:'churned',cost:8000}]).profit).toBe(7000));
 it('uses collected amount over billed amount for collection rate',()=>expect(financialSummary(clients,payments,[]).collectionRate).toBe(75));
 it('marks an unpaid past-due payment overdue',()=>expect(paymentStatus(payments[1],'2026-10-12')).toBe('OVERDUE'));
 it('keeps paid payments paid after their due date',()=>expect(paymentStatus(payments[0],'2026-10-12')).toBe('PAID'));
 it('requires the full setup fee to be collected',()=>{expect(setupStatus(clients[0],payments)).toBe('PAID');expect(setupStatus(clients[0],[{...payments[0],amount:10000}])).toBe('OUTSTANDING');});
 it('separates recurring collections from setup revenue',()=>expect(monthlyRevenue(payments,'2026-10-12').at(-1)).toMatchObject({revenue:30000,mrr:0}));
});