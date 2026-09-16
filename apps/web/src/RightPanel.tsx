import React, { useRef, useState } from "react";
import { FileSearch2, MonitorUp } from "lucide-react";

interface RightPanelProps {
  projectName: string;
  chatTitle: string;
}

export function RightPanel(props: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<"changes" | "preview">("changes");
  const changesTab = useRef<HTMLButtonElement>(null);
  const previewTab = useRef<HTMLButtonElement>(null);

  function selectAdjacentTab(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "ArrowLeft" || event.key === "Home" ? "changes" : "preview";
    setActiveTab(next);
    (next === "changes" ? changesTab : previewTab).current?.focus();
  }

  return <>
    <div className="right-tabs" role="tablist" aria-label="右侧面板">
      <button ref={changesTab} role="tab" aria-selected={activeTab === "changes"} tabIndex={activeTab === "changes" ? 0 : -1} onKeyDown={selectAdjacentTab} onClick={() => setActiveTab("changes")}>变更</button>
      <button ref={previewTab} role="tab" aria-selected={activeTab === "preview"} tabIndex={activeTab === "preview" ? 0 : -1} onKeyDown={selectAdjacentTab} onClick={() => setActiveTab("preview")}>预览</button>
      <span className="right-tools" aria-hidden="true"><FileSearch2 /><MonitorUp /></span>
    </div>
    {activeTab === "changes" ? <div className="changes-empty" role="status"><FileSearch2 aria-hidden="true"/><h3>暂无文件变更</h3><p>文件变更会随本次运行记录出现在这里。</p><small>支持文件列表与行级差异的只读查看。</small></div> : <div className="preview-empty"><MonitorUp aria-hidden="true"/><h3>浏览器预览</h3><p>{props.projectName} / {props.chatTitle}</p><small>连接本地预览服务后在这里显示页面。</small></div>}
  </>;
}
