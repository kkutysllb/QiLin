'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReactFlow, { Background, Controls, type Node, type Edge } from 'reactflow';
import 'reactflow/dist/style.css';

const nodes: Node[] = [
  {
    id: 'orchestrator',
    type: 'input',
    position: { x: 250, y: 50 },
    data: { label: '🎯 Orchestrator' },
    style: { background: '#10b981', color: 'white', border: 'none', borderRadius: 8, padding: 10 }
  },
  {
    id: 'worker-1',
    position: { x: 100, y: 200 },
    data: { label: 'Worker: code' },
    style: { background: '#1f1f23', color: 'white', border: '1px solid #10b981', borderRadius: 8, padding: 10 }
  },
  {
    id: 'worker-2',
    position: { x: 300, y: 200 },
    data: { label: 'Worker: research' },
    style: { background: '#1f1f23', color: 'white', border: '1px solid #10b981', borderRadius: 8, padding: 10 }
  },
  {
    id: 'worker-3',
    position: { x: 500, y: 200 },
    data: { label: 'Worker: review' },
    style: { background: '#1f1f23', color: 'white', border: '1px solid #10b981', borderRadius: 8, padding: 10 }
  }
];

const edges: Edge[] = [
  { id: 'e-o1', source: 'orchestrator', target: 'worker-1', animated: true, style: { stroke: '#10b981' } },
  { id: 'e-o2', source: 'orchestrator', target: 'worker-2', animated: true, style: { stroke: '#10b981' } },
  { id: 'e-o3', source: 'orchestrator', target: 'worker-3', animated: true, style: { stroke: '#10b981' } }
];

export function OrchestratorGraphModal({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>多智能体编排可视化</DialogTitle>
        </DialogHeader>
        <div className="h-[500px] rounded-md border bg-card">
          <ReactFlow nodes={nodes} edges={edges} fitView>
            <Background color="#333" gap={16} />
            <Controls />
          </ReactFlow>
        </div>
        <p className="text-xs text-muted-foreground">
          多智能体 OrchestratorGraph 拓扑示例(orchestrator → N worker)。Phase 1
          将接入真实 SSE 流渲染动态路由。
        </p>
      </DialogContent>
    </Dialog>
  );
}
