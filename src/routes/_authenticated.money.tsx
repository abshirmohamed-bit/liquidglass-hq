import {createFileRoute} from '@tanstack/react-router';
import {Money} from '@/components/agency/money';
import {pageHead} from '@/components/agency/pages';
import {agencyQuery} from '@/lib/agency-query';
export const Route=createFileRoute('/_authenticated/money')({head:()=>pageHead('Money'),loader:({context})=>context.queryClient.ensureQueryData(agencyQuery),component:Money});