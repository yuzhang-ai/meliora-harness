import React, { useRef, useState } from "react";

interface RightPanelProps {
  projectName: string;
  chatTitle: string;
  onCloseNotice: () => void;
  noticeVisible: boolean;
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
      <span className="right-tools">⌁　↗　◫</span>
    </div>
    {activeTab === "changes" ? <div className="changes-empty" role="status"><span aria-hidden="true">◇</span><h3>暂无文件变更</h3><p>当前 fixture 只回放公开运行事件，尚未提供 Diff。</p><small>产生真实变更后，这里将显示文件与行级差异。</small></div> : <div className="preview-empty"><span>◫</span><h3>浏览器预览</h3><p>{props.projectName} / {props.chatTitle}</p><small>连接本地预览服务后在这里显示页面。</small></div>}
    {props.noticeVisible && <aside className="privacy-notice" role="status">
      <button className="notice-close" aria-label="关闭通知" onClick={props.onCloseNotice}>×</button>
      <h3>分析与 Cookie</h3>
      <p>这是一条界面展示通知。当前本地版本不会上传项目文件或保存真实凭证。</p>
      <div><button className="primary" onClick={props.onCloseNotice}>知道了</button><button onClick={props.onCloseNotice}>稍后</button></div>
    </aside>}
  </>;
}
