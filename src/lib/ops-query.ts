import { queryOptions } from "@tanstack/react-query";
import { getOps } from "./ops.functions";
export const opsQuery = queryOptions({ queryKey: ["ops"], queryFn: () => getOps(), staleTime: 15000 });
