/**
 * 「运行时」设置页 — 无缝内嵌 archify 生成的运行时架构图。
 *
 * 静态资源位于 public/architecture/qilin-runtime.html（自导出文件
 * 字节级原样复制，含主题系统与全部交互脚本）。经 iframe 以
 * archify 原生 ?embed=1 模式加载：隐藏其独立头部工具条，
 * 缩放/折叠/搜索等交互完整保留。
 */
export function RuntimeSettingsPage() {
  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[520px] flex-col overflow-hidden rounded-lg border">
      <iframe
        src="/architecture/qilin-runtime.html?embed=1&theme=dark"
        title="QiLin 运行时架构图"
        className="size-full border-0 bg-transparent"
      />
    </div>
  );
}
