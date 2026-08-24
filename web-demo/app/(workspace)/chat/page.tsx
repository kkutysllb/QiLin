import { NewChatClient } from './new-chat-client';

export const dynamic = 'force-dynamic';

export default function NewChatPage() {
  // 完全在客户端创建 thread:浏览器自动注入 csrf_token cookie,
  // 避免 server component 转发 cookie 到 gateway 的复杂度。
  return <NewChatClient />;
}
