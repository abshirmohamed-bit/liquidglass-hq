import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart, type UIMessage } from 'ai';
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Plus, PanelRight, Trash2, Film, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from '@/components/ai-elements/prompt-input';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import { ideationQuery } from '@/lib/ideation-query';
import { agencyQuery } from '@/lib/agency-query';
import { createIdeationThread, deleteIdeationThread } from '@/lib/ideation.functions';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';

export function Ideation({ threadId, initialMessages = [] }: { threadId?: string; initialMessages?: UIMessage[] }) {
  const { data: threads } = useSuspenseQuery(ideationQuery);
  const { data: agency } = useSuspenseQuery(agencyQuery);
  const [panel, setPanel] = useState(true);
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const cache = useQueryClient();
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { input.current?.focus(); }, [threadId]);
  const start = async (text: string) => {
    if (!text.trim() || creating) return;
    setCreating(true);
    try {
      const thread = await createIdeationThread({ data: { title: text.trim().slice(0, 80), clientId: clientId || null } });
      await cache.invalidateQueries({ queryKey: ['ideation'] });
      sessionStorage.setItem(`ideation-draft-${thread.id}`, text);
      await navigate({ to: '/ideation/$threadId', params: { threadId: thread.id } });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not create conversation.'); } finally { setCreating(false); }
  };
  return <div className="page ideation-page">
    <header className="section-toolbar"><h1>Ideation</h1><div className="actions">
      {!threadId && <select aria-label="Tag conversation to client" value={clientId} onChange={event => setClientId(event.target.value)} className="chat-client-select"><option value="">All clients</option>{agency.clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select>}
      <Button variant="ghost" size="icon" asChild title="New conversation"><Link to="/ideation"><Plus /></Link></Button>
      <Button variant="ghost" size="icon" title="Toggle conversations" aria-label="Toggle conversations" onClick={() => setPanel(!panel)}><PanelRight /></Button>
    </div></header>
    <div className={`ideation-layout ${panel && threads.length ? 'with-threads' : ''}`}>
      {threadId ? <IdeationChat key={threadId} threadId={threadId} initialMessages={initialMessages} /> : <div className="ideation-empty"><div className="chat-greeting"><Film /><h2>What are we creating today?</h2></div><PromptInput onSubmit={({ text }) => start(text)} className="chat-composer"><PromptInputTextarea ref={input} aria-label="Message" placeholder="Ask about a video, title, or content idea…" /><PromptInputFooter className="justify-end"><PromptInputSubmit aria-label="Send message" disabled={creating} status={creating ? 'submitted' : 'ready'}><ArrowUp /></PromptInputSubmit></PromptInputFooter></PromptInput></div>}
      {panel && threads.length > 0 && <aside className="thread-panel" aria-label="Conversations"><h2>Conversations</h2><Input aria-label="Search conversations" placeholder="Search conversations…" value={search} onChange={event => setSearch(event.target.value)} /><div className="thread-list">{threads.filter(thread => thread.title.toLowerCase().includes(search.toLowerCase())).map(thread => <div className={`thread-row ${thread.id === threadId ? 'selected' : ''}`} key={thread.id}><Link to="/ideation/$threadId" params={{ threadId: thread.id }}><span>{thread.title}</span>{thread.client_id && <small>{agency.clients.find(client => client.id === thread.client_id)?.name}</small>}</Link><Button variant="ghost" size="icon-sm" title="Delete conversation" aria-label={`Delete ${thread.title}`} onClick={async () => { if (!confirm('Delete this conversation?')) return; try { await deleteIdeationThread({ data: { id: thread.id } }); await cache.invalidateQueries({ queryKey: ['ideation'] }); if (thread.id === threadId) await navigate({ to: '/ideation' }); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not delete conversation.'); } }}><Trash2 /></Button></div>)}</div></aside>}
    </div>
  </div>;
}

function IdeationChat({ threadId, initialMessages }: { threadId: string; initialMessages: UIMessage[] }) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');
  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/ideation', body: { threadId }, headers: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  } }), [threadId]);
  const cancelSaved = useRef(false);
  const { messages, sendMessage, status, stop, error } = useChat({ id: threadId, messages: initialMessages, transport, onError: error => toast.error(error.message), onFinish: async ({ message, isAbort }) => {
    if (isAbort && message?.id && !cancelSaved.current) {
      cancelSaved.current = true;
      const parts = [...message.parts, { type: 'text' as const, text: '_Stopped._' }];
      const content = parts.filter(part => part.type === 'text').map(part => part.text).join('\n');
      const { error: saveError } = await supabase.from('ideation_messages').upsert({ thread_id: threadId, sdk_message_id: message.id, role: 'assistant', content, parts: parts as unknown as Json }, { onConflict: 'thread_id,sdk_message_id' });
      if (saveError) toast.error(`Could not save stopped response: ${saveError.message}`);
    }
    textarea.current?.focus();
  } });
  const busy = status === 'submitted' || status === 'streaming';
  useEffect(() => { if (busy) cancelSaved.current = false; }, [busy]);
  useEffect(() => {
    textarea.current?.focus();
    const key = `ideation-draft-${threadId}`;
    const pending = sessionStorage.getItem(key);
    if (!pending) return;
    const timer = setTimeout(() => { sessionStorage.removeItem(key); void sendMessage({ text: pending }); }, 0);
    return () => clearTimeout(timer);
  }, [threadId, sendMessage]);
  return <div className="chat-workspace"><Conversation className="chat-transcript"><ConversationContent>{messages.map(message => <Message key={message.id} from={message.role}><MessageContent>{message.parts.map((part, index) => {
    if (part.type === 'text') return <MessageResponse key={index}>{part.text}</MessageResponse>;
    if (part.type === 'reasoning') return <details className="chat-reasoning" key={index}><summary>Thinking</summary><MessageResponse>{part.text}</MessageResponse></details>;
    if (isToolUIPart(part)) return <Tool key={index} defaultOpen={false}>{part.type === 'dynamic-tool' ? <ToolHeader type={part.type} toolName={part.toolName} state={part.state} /> : <ToolHeader type={part.type} state={part.state} />}<ToolContent><ToolInput input={part.input} /><ToolOutput output={'output' in part ? part.output : null} errorText={'errorText' in part && part.errorText ? part.errorText : ''} /></ToolContent></Tool>;
    return null;
  })}</MessageContent></Message>)}{status === 'submitted' && <Shimmer>Thinking…</Shimmer>}</ConversationContent><ConversationScrollButton /></Conversation>
    {error && <p role="alert" className="text-destructive text-sm">{error.message}</p>}
    <PromptInput className="chat-composer" onSubmit={async ({ text }) => { if (busy || !text.trim()) return; setDraft(''); await sendMessage({ text }); textarea.current?.focus(); }}><PromptInputTextarea ref={textarea} aria-label="Message" placeholder="Ask about a video, title, or content idea…" value={draft} onChange={event => setDraft(event.target.value)} /><PromptInputFooter className="justify-end"><PromptInputSubmit aria-label={busy ? 'Stop response' : 'Send message'} status={status} disabled={!busy && !draft.trim()} onStop={stop} /></PromptInputFooter></PromptInput>
  </div>;
}