import { queryOptions } from '@tanstack/react-query';
import { getAgency } from './agency.functions';
export const agencyQuery=queryOptions({queryKey:['agency'],queryFn:()=>getAgency(),staleTime:15000});