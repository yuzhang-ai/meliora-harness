import React, { useRef, useState } from "react";
import { CheckCircle2, FileSearch2, ListChecks, PanelRightClose, PanelRightOpen, ShieldCheck, Wrench } from "lucide-react";
import type { PublicRunEvent } from "../../../packages/agent-runtime/public-events";
import { projectEvidence } from "./event-projection";

interface RightPanelProps {
  projectName: string;
  chatTitle: string;
  collapsed: boolean;
  onCollapse: () => void;
  productMode?: boolean;
  events?: readonly PublicRunEvent[];
  statusLabel?: string;
}

export function RightPanel(props: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<"changes" | "run">(props.productMode ? "run" : "changes");
  const changesTab = useRef<HTMLButtonElement>(null);
  const runTab = useRef<HTMLButtonElement>(null);
  const evidence = projectEvidence(props.events ?? []);

  function selectAdjacentTab(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const selectFirst = event.key === "ArrowLeft" || event.key === "Home";
    const next = props.productMode
      ? selectFirst ? "run" : "changes"
      : selectFirst ? "changes" : "run";
    setActiveTab(next);
    (next === "changes" ? changesTab : runTab).current?.focus();
  }

  if (props.collapsed) return <div className="right-collapsed-rail">
    <button className="icon-button" aria-label="展开右栏" onClick={props.onCollapse}><PanelRightOpen /></button>
    <FileSearch2 aria-hidden="true"/>
  </div>;

  return <>
    <div className="right-tabs" role="tablist" aria-label="右侧面板">
      {props.productMode && <button ref={runTab} role="tab" aria-selected={activeTab === "run"} tabIndex={activeTab === "run" ? 0 : -1} onKeyDown={selectAdjacentTab} onClick={() => setActiveTab("run")}>运行</button>}
      <button ref={changesTab} role="tab" aria-selected={activeTab === "changes"} tabIndex={activeTab === "changes" ? 0 : -1} onKeyDown={selectAdjacentTab} onClick={() => setActiveTab("changes")}>变更</button>
      {!props.productMode && <button ref={runTab} role="tab" aria-selected={activeTab === "run"} tabIndex={activeTab === "run" ? 0 : -1} onKeyDown={selectAdjacentTab} onClick={() => setActiveTab("run")}>预览</button>}
      <span className="right-tools" aria-hidden="true"><ListChecks /><FileSearch2 /></span>
      <button className="icon-button right-collapse-button" aria-label="收起右栏" onClick={props.onCollapse}><PanelRightClose /></button>
    </div>
    {activeTab === "changes" ? <div className="changes-empty" role="status"><FileSearch2 aria-hidden="true"/>{props.productMode ? <><h3>没有文件变更</h3><p>当前是只读任务，Meliora 不会修改项目文件。</p><small>后续写入能力会在明确审批后单独开放。</small></> : <><h3>暂无文件变更</h3><p>文件变更会随本次运行记录出现在这里。</p><small>支持文件列表与行级差异的只读查看。</small></>}</div> : props.productMode ? <section className="run-inspector" aria-label="运行证据">
      <div className="run-inspector-summary"><span className="inspector-icon"><ListChecks aria-hidden="true"/></span><div><small>当前状态</small><strong>{props.statusLabel || "准备就绪"}</strong></div><span className="event-count">{props.events?.length ?? 0} 条公开事件</span></div>
      <div className="inspector-section"><h3><ShieldCheck aria-hidden="true"/>权限边界</h3><p>仅使用服务端批准的只读工具。浏览器不保存模型密钥，也不能直接访问服务器文件。</p></div>
      <div className="inspector-section"><h3><Wrench aria-hidden="true"/>工具记录</h3>{evidence.tools.length ? <ul className="evidence-list">{evidence.tools.map((tool) => <li key={tool.invocationId}><span><strong>{tool.toolName}</strong><small>{tool.summary}</small></span><em className={`evidence-status ${tool.status}`}>{tool.status === "presented" ? "已发起" : tool.status === "succeeded" ? "成功" : tool.status === "failed" ? "失败" : "已取消"}</em></li>)}</ul> : <p className="inspector-empty">运行工具后，这里会显示公开摘要。</p>}</div>
      <div className="inspector-section"><h3><CheckCircle2 aria-hidden="true"/>验证结果</h3>{evidence.verifications.length ? <ul className="evidence-list">{evidence.verifications.map((verification) => <li key={verification.verificationId}><span><strong>结果验证</strong><small>只展示公开验证状态</small></span><em className={`evidence-status ${verification.status}`}>{verification.status === "passed" ? "通过" : verification.status === "failed" ? "未通过" : "未运行"}</em></li>)}</ul> : <p className="inspector-empty">任务完成验证后会在这里留下记录。</p>}{evidence.publicArtifactCount > 0 && <small className="artifact-count">已关联 {evidence.publicArtifactCount} 个公开证据引用</small>}</div>
    </section> : <div className="preview-empty"><ListChecks aria-hidden="true"/><h3>界面状态预览</h3><p>{props.projectName} / {props.chatTitle}</p><small>这里仅用于无密钥 fixture 回放。</small></div>}
  </>;
}
