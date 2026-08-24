import { threadsApi } from '@/lib/api';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function NewChatPage() {
  try {
    const thread = await threadsApi.create({ title: '新对话' });
    redirect(`/chat/${thread.thread_id}`);
  } catch (e) {
    redirect('/login');
  }
}
