import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const id = z.object({ id: z.string() });
export const f = createServerFn({ method: "POST" }).inputValidator(id).handler(async () => 1);
