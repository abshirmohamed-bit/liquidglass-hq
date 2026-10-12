import { createFileRoute } from '@tanstack/react-router';
import { ClientDetail } from '@/components/agency/clients';
import { pageHead } from '@/components/agency/pages';
import { agencyQuery } from '@/lib/agency-query';
export const Route=createFileRoute('/_authenticated/clients/$clientId')({head:()=>pageHead('Client profile'),loader:({context})=>context.queryClient.ensureQueryData(agencyQuery),component:()=>{const {clientId}=Route.useParams();return <ClientDetail id={clientId}/>;}});