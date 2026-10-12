import { createFileRoute } from '@tanstack/react-router';
import { handleIdeation } from '@/lib/ideation.server';
export const Route = createFileRoute('/api/ideation')({ server: { handlers: { POST: ({ request }) => handleIdeation(request) } } });