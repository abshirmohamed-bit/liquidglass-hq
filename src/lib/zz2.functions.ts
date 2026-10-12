import { createServerFn } from "@tanstack/react-start";
export const f = createServerFn({method:"GET"}).handler(async()=>1);
