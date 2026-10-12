import { queryOptions } from "@tanstack/react-query";
import { getIdeation, getIdeationThread } from "./ideation.functions";
export const ideationQuery = queryOptions({ queryKey: ["ideation"], queryFn: () => getIdeation() });
export const ideationThreadQuery = (id: string) =>
  queryOptions({
    queryKey: ["ideation", id],
    queryFn: () => getIdeationThread({ data: { id } }),
    staleTime: 0,
  });
