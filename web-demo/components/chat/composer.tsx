'use client';
import { useState, useRef, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Paperclip, Loader2 } from 'lucide-react';

export function Composer({
  onSend,
  disabled
}: {
  onSend: (text: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    const t = text.trim();
    if (!t || sending || disabled) return;
    setSending(true);
    try {
      await onSend(t);
      setText('');
      textareaRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t bg-background/50 p-4 backdrop-blur">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-lg border bg-card p-2">
          <Button variant="ghost" size="icon" aria-label="附件" type="button">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder="发送消息…(⌘/Ctrl + Enter)"
            className="min-h-[40px] resize-none border-0 focus-visible:ring-0"
            rows={1}
          />
          <Button onClick={submit} disabled={!text.trim() || sending || disabled}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          {disabled ? '正在连接…' : '按 ⌘/Ctrl + Enter 发送 · 消息将流式显示'}
        </p>
      </div>
    </div>
  );
}
