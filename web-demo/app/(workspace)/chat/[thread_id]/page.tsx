import { ChatView } from '@/components/chat/chat-view';
import { threadsApi } from '@/lib/api';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ChatPage({ params }: { params: { thread_id: string } }) {
  let thread = null;
  try {
    thread = await threadsApi.get(params.thread_id);
  } catch {
    redirect('/login');
  }
  return <ChatView threadId={params.thread_id} initialTitle={thread?.title} />;
}
