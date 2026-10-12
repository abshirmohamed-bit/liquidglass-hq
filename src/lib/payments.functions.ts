import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
export const recordPayment=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({client_id:z.string().uuid(),amount:z.number().positive(),type:z.enum(['SETUP','MONTHLY']),due_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)})).handler(async({data,context})=>{
 const {error}=await context.supabase.from('payments').insert({...data,status:'PENDING'});
 if(error)throw new Error('Could not record this payment. Please try again.');
 return true;
});
export const markPaymentPaid=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid()})).handler(async({data,context})=>{
 const {data:payment,error}=await context.supabase.from('payments').update({status:'PAID',paid_date:new Date().toISOString().slice(0,10)}).eq('id',data.id).select().single();
 if(error)throw new Error('Could not mark this payment paid. Please try again.');
 return payment;
});