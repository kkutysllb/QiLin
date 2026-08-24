import { ChatView } from '@/components/chat/chat-view';
import { setupSsrCookies, threadsApi } from '@/lib/api/server-fetch';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ChatPage({ params }: { params: { thread_id: string } }) {
  await setupSsrCookies();
  let thread = null;
  try {
    thread = await threadsApi.get(params.thread_id);
  } catch (e) {
    redirect('/login');
  }
  return <ChatView threadId={params.thread_id} initialTitle={thread?.title} />;
}
