import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const id = z.object({ id: z.string() });
export const f = createServerFn({ method: "POST" }).inputValidator((d: unknown) => id.parse(d)).handler(async () => 1);
