import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { customFeeValid } from './agency-rules';
export const getAgency = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const results=await Promise.all([context.supabase.from('clients').select('*').order('name'),context.supabase.from('payments').select('*'),context.supabase.from('team_members').select('*'),context.supabase.from('client_progress').select('*').order('updated_at',{ascending:false}),context.supabase.from('analytics_snapshots').select('*').order('date',{ascending:false})]);
 for(const result of results)if(result.error)throw new Error(result.error.message);
 return {clients:results[0].data||[],payments:results[1].data||[],team:results[2].data||[],progress:results[3].data||[],snapshots:results[4].data||[]};
});
const clientInput=z.object({id:z.string().uuid().optional(),name:z.string().trim().min(1),channel_url:z.string(),plan_type:z.enum(['TEAM_ONLY','PERSONAL_INVOLVED','CUSTOM']),custom_plan_label:z.string(),monthly_fee:z.number().nonnegative(),setup_fee:z.number().nonnegative(),start_date:z.string(),status:z.enum(['ACTIVE','CHURNED']),notes:z.string()}).superRefine((v,c)=>{if(v.plan_type==='CUSTOM'&&!customFeeValid(v.monthly_fee))c.addIssue({code:z.ZodIssueCode.custom,path:['monthly_fee'],message:'Custom fees must be in steps of 1000, up to 20000.'});});
export const saveClient=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(clientInput).handler(async({data,context})=>{
 const {id,...fields}=data;const row={...fields,start_date:fields.start_date||null};
 const result=id?await context.supabase.from('clients').update(row).eq('id',id).select().single():await context.supabase.from('clients').insert({...row,owner_id:context.userId}).select().single();
 if(result.error)throw new Error(result.error.message);return result.data;
});
export const deleteClient=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid()})).handler(async({data,context})=>{
 const {data:client,error:readError}=await context.supabase.from('clients').select('status').eq('id',data.id).single();if(readError)throw new Error(readError.message);if(client.status!=='CHURNED')throw new Error('Only churned clients can be deleted.');
 const {error}=await context.supabase.from('clients').delete().eq('id',data.id);if(error)throw new Error(error.message);return true;
});
export const analyzeClient=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid()})).handler(async({data,context})=>{
 const {data:client,error}=await context.supabase.from('clients').select('*').eq('id',data.id).single();if(error)throw new Error(error.message);
 const key=process.env['YOUTUBE_API_KEY'];if(!key)throw new Error('YouTube is not connected yet. Your client is saved; channel analysis needs a YouTube API key.');
 const {analyzeChannel}=await import('./channel.server');const analysis=await analyzeChannel(client.channel_url||'',key);
 const result=await context.supabase.from('clients').update(analysis).eq('id',data.id);if(result.error)throw new Error(result.error.message);return analysis;
});