import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/components/agency/pages";
import { Editor } from "@/components/agency/editor";
export const Route = createFileRoute("/_authenticated/editor/$clipId")({ head: () => pageHead("Editor"), component: EditorPage });
function EditorPage() { const { clipId } = Route.useParams(); return <Editor clipId={clipId} />; }
