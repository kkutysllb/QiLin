/**
 * 「运行时」设置页 — 无缝内嵌 archify 生成的运行时架构图。
 *
 * 静态资源位于 public/architecture/qilin-runtime.html（自导出文件
 * 字节级原样复制）。iframe 全功能加载——不启用 archify 的 ?embed=1
 * 裁剪模式（那会隐藏主题切换/预设/导出/引导导览等动作按钮与卡片介绍，
 * 违背"完全无缝移植"）；仅以 ?theme=dark 钉住初始主题与设置页融合。
 */
export function RuntimeSettingsPage() {
  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[600px] flex-col overflow-hidden rounded-lg border">
      <iframe
        src="/architecture/qilin-runtime.html?theme=dark"
        title="QiLin 运行时架构图"
        className="size-full border-0 bg-transparent"
      />
    </div>
  );
}
