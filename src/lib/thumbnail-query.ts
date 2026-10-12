import { queryOptions } from "@tanstack/react-query";
import { getThumbnailMessages, getThumbnailSessions } from "./thumbnails.functions";
export const thumbnailSessionsQuery = queryOptions({ queryKey: ["thumbnails"], queryFn: () => getThumbnailSessions() });
export const thumbnailMessagesQuery = (id: string) =>
  queryOptions({ queryKey: ["thumbnails", id], queryFn: () => getThumbnailMessages({ data: { id } }) });
