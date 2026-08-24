'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2 } from 'lucide-react';
import { memoryApi } from '@/lib/api';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const CATEGORIES = ['context', 'preference', 'project', 'person', 'fact', 'rule'];

export function MemoryCreateDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('context');
  const [confidence, setConfidence] = useState(0.5);

  const mutation = useMutation({
    mutationFn: () =>
      memoryApi.create({
        content,
        category,
        confidence
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memory-facts'] });
      toast.success('事实已创建');
      reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(`创建失败: ${(e as Error).message}`)
  });

  const reset = () => {
    setContent('');
    setCategory('context');
    setConfidence(0.5);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建事实</DialogTitle>
          <DialogDescription>
            创建一个可被 Agent 检索的记忆条目
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="content">内容</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="例如:用户的项目叫 QiLin,是一个 Python 智能体引擎"
              rows={4}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>分类</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confidence">置信度 ({(confidence * 100).toFixed(0)}%)</Label>
              <Input
                id="confidence"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={confidence}
                onChange={(e) => setConfidence(parseFloat(e.target.value))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
              取消
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={!content.trim() || mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              创建
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
