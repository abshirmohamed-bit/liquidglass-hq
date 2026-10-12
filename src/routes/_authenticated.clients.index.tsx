import { createFileRoute } from '@tanstack/react-router';
import { Clients } from '@/components/agency/clients';
import { pageHead } from '@/components/agency/pages';
import { agencyQuery } from '@/lib/agency-query';
export const Route=createFileRoute('/_authenticated/clients/')({head:()=>pageHead('Clients'),loader:({context})=>context.queryClient.ensureQueryData(agencyQuery),component:Clients});