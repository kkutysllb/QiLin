// Server layout: deep-import the layout module (NOT the chats barrel) so the
// server dependency graph does not pull client-only hook modules.
import {
  ChatPageLayout,
  makeChatLayoutGenerateStaticParams,
} from "@/components/workspace/chats/chat-page-layout";

export const generateStaticParams = makeChatLayoutGenerateStaticParams({
  thread_id: "new",
});

export default ChatPageLayout;
