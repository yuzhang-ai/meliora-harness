import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUp, Copy, Menu, Mic, MoreHorizontal, PanelRightOpen, Plus, Share2, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import type { PublicRunEvent } from "../../../packages/agent-runtime/public-events";
import { Sidebar } from "./Sidebar";
import { RightPanel } from "./RightPanel";
import { addProject, defaultLibrary, newChat, parseLibrary, type Chat, type Library, type Project } from "./projects";
import { LiveRunController, TURN_COMMAND_REQUEST_SCHEMA_VERSION, WebLiveAdapter } from "./live-adapter";
import { initialLiveRunState, type LiveRunState } from "./live-state";
import { LIVE_SESSION_KEY, readLiveSession, saveLiveSession } from "./live-session";
import { labels, publicEvents, resumePoint, scenarios, statusOf, streamFor, type Scenario } from "./replay";
import { installViewportEnvironment, SINGLE_PANE_MEDIA } from "./viewport";
import "./dark-shell.css";

function initialLibrary() {
  try { return parseLibrary(sessionStorage.getItem("meliora-project-library-v2")); }
  catch { return defaultLibrary(); }
}

function savedPreference(key: string, fallback: string) {
  try { return localStorage.getItem(key) || fallback; }
  catch { return fallback; }
}

const initialProjectList = initialLibrary();
const initialChat = initialProjectList.projects.flatMap((project) => project.chats).find((chat) => chat.id === initialProjectList.activeId)!;
const liveStorage = (() => { try { return localStorage; } catch { return null; } })();
const initialSavedLiveSession = liveStorage ? readLiveSession(liveStorage) : null;

const livePhaseLabel: Record<LiveRunState["phase"], string> = {
  idle: "准备就绪", submitting: "提交中", resuming: "恢复中", connecting: "连接中",
  live: "运行中", disconnected: "连接已断开", terminal: "已结束", error: "连接错误",
};

function App() {
  const [library, setLibrary] = useState<Library>(initialProjectList);
  const [scenarioId, setScenarioId] = useState<Scenario>(initialChat.scenario);
  const [eventCount, setEventCount] = useState(initialChat.count);
  const [message, setMessage] = useState(initialChat.message);
  const [draft, setDraft] = useState(initialChat.draft);
  const [liveMode, setLiveMode] = useState(Boolean(initialSavedLiveSession));
  const [liveWorkspaceId, setLiveWorkspaceId] = useState(initialSavedLiveSession?.workspaceId ?? "");
  const [liveDraft, setLiveDraft] = useState("");
  const [liveMessage, setLiveMessage] = useState("");
  const [liveState, setLiveState] = useState<LiveRunState>(() => initialSavedLiveSession?.kind === "pending"
    ? { ...initialLiveRunState(), phase: "error", errorCode: "turn_submission_outcome_unknown" }
    : initialLiveRunState());
  const [pendingSubmission, setPendingSubmission] = useState(initialSavedLiveSession?.kind === "pending");
  const [knownRunRecord, setKnownRunRecord] = useState(initialSavedLiveSession?.kind === "run");
  const liveController = useRef<LiveRunController | null>(null);
  const [decision, setDecision] = useState(initialChat.decision);
  const [playing, setPlaying] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"nav" | "code" | null>(null);
  const [notice, setNotice] = useState("");
  const [voiceActive, setVoiceActive] = useState(false);
  const [modelName, setModelName] = useState("DeepSeek V3");
  const [reaction, setReaction] = useState<"like" | "dislike" | "">("");
  const [theme, setTheme] = useState<"light" | "dark">(() => savedPreference("meliora-theme-v2", "light") === "dark" ? "dark" : "light");
  const [userName, setUserName] = useState(() => savedPreference("meliora-user-name", "张子恒"));
  const [userAvatar, setUserAvatar] = useState(() => savedPreference("meliora-user-avatar", "张"));
  const [dialogMode, setDialogMode] = useState<"project" | "automations" | "customize" | null>(null);
  const [projectName, setProjectName] = useState("");
  const [profileName, setProfileName] = useState(userName);
  const [profileAvatar, setProfileAvatar] = useState(userAvatar);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const composerComposing = useRef(false);
  const liveWorkspaceIdRef = useRef(liveWorkspaceId);
  liveWorkspaceIdRef.current = liveWorkspaceId;
  if (!liveController.current) {
    liveController.current = new LiveRunController(new WebLiveAdapter(import.meta.env.VITE_MELIORA_API_BASE_URL ?? ""), (state) => {
      setLiveState(state);
      if (state.identity) {
        if (liveStorage && !saveLiveSession(liveStorage, { kind: "run", workspaceId: liveWorkspaceIdRef.current, runId: state.identity.runId })) {
          setNotice("浏览器无法保存 Run ID；本次运行可继续查看，但刷新后可能无法恢复。");
        }
        setPendingSubmission(false);
        setKnownRunRecord(true);
      }
    });
    if (initialSavedLiveSession?.kind === "pending") liveController.current.state = {
      ...initialLiveRunState(), phase: "error", errorCode: "turn_submission_outcome_unknown",
    };
  }

  const projectList = library.projects;
  const activeProject = projectList.find((project) => project.chats.some((chat) => chat.id === library.activeId))!;
  const activeChat = activeProject.chats.find((chat) => chat.id === library.activeId)!;
  const source = streamFor(scenarioId);
  const events = liveMode ? liveState.events : publicEvents(source.slice(0, eventCount));
  const runStatus = liveMode ? liveState.phase : statusOf(events, scenarioId === "reconnecting" ? "recovering" : "created");
  const scenario = scenarios.find((item) => item.id === scenarioId)!;

  const messages = liveMode ? [
    ...(liveMessage ? [{ id: "live-user-message", role: "user" as const, content: liveMessage }] : []),
  ] : [
    ...(message.trim() || events.length ? [{ id: "user-message", role: "user" as const, content: message || `${scenario.title}：请展示 ${scenario.description} 的执行过程。` }] : []),
    ...(events.length ? [{ id: "assistant-message", role: "assistant" as const, content: "我会根据公开事件逐步展示任务状态，并把工具、审批、验证和最终结果保留在可追踪的消息流中。" }] : []),
  ];
  const showEmpty = liveMode ? liveState.phase === "idle" && !liveMessage : !message.trim() && events.length === 0 && !playing && scenarioId !== "reconnecting";
  const showLoading = liveMode ? ["submitting", "resuming", "connecting", "live"].includes(liveState.phase) && events.length === 0 : events.length === 0 && (playing || Boolean(message.trim()));

  useEffect(() => installViewportEnvironment(document.documentElement), []);

  useEffect(() => {
    if (!initialSavedLiveSession || initialSavedLiveSession.kind !== "run") return;
    void liveController.current!.restore(initialSavedLiveSession.runId);
  }, []);

  useEffect(() => {
    if (!liveMode || liveState.phase !== "disconnected" || liveState.reconnectCount >= 3) return;
    const timer = window.setTimeout(() => { void liveController.current!.reconnect(); }, 1000 * (liveState.reconnectCount + 1));
    return () => window.clearTimeout(timer);
  }, [liveMode, liveState.phase, liveState.reconnectCount]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("meliora-theme-v2", theme); }
    catch { /* browser storage can be unavailable */ }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("meliora-user-name", userName);
      localStorage.setItem("meliora-user-avatar", userAvatar);
    } catch { /* browser storage can be unavailable */ }
  }, [userName, userAvatar]);

  useEffect(() => {
    setLibrary((current) => ({
      ...current,
      projects: current.projects.map((project) => ({
        ...project,
        chats: project.chats.map((chat) => chat.id === current.activeId ? { ...chat, scenario: scenarioId, count: eventCount, message, draft, decision } : chat),
      })),
    }));
  }, [scenarioId, eventCount, message, draft, decision]);

  useEffect(() => {
    try { sessionStorage.setItem("meliora-project-library-v2", JSON.stringify(library)); }
    catch { /* browser storage can be unavailable */ }
  }, [library]);

  useEffect(() => {
    if (dialogMode) settingsDialog.current?.showModal();
    else settingsDialog.current?.close();
  }, [dialogMode]);

  useEffect(() => {
    if (!playing) return;
    if (eventCount >= source.length) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setEventCount((count) => count + 1), 750);
    return () => window.clearTimeout(timer);
  }, [playing, eventCount, source.length]);

  useEffect(() => {
    if (!mobilePanel) return;
    const closePanel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobilePanel(null);
    };
    window.addEventListener("keydown", closePanel);
    return () => window.removeEventListener("keydown", closePanel);
  }, [mobilePanel]);

  function selectChat(chat: Chat) {
    setScenarioId(chat.scenario);
    setEventCount(chat.count);
    setMessage(chat.message);
    setDraft(chat.draft);
    setDecision(chat.decision);
    setPlaying(false);
    setReaction("");
    setNotice("");
  }

  function openChat(chatId: string) {
    const chat = projectList.flatMap((project) => project.chats).find((item) => item.id === chatId);
    if (!chat) return;
    setLibrary((current) => ({ ...current, activeId: chatId }));
    selectChat(chat);
  }

  function createAgent() {
    const chat = newChat();
    setLibrary((current) => ({
      ...current,
      activeId: chat.id,
      projects: current.projects.map((project) => project.id === activeProject.id ? { ...project, chats: [...project.chats, chat] } : project),
    }));
    selectChat(chat);
  }

  function showDialog(mode: "project" | "automations" | "customize") {
    setProfileName(userName);
    setProfileAvatar(userAvatar);
    setProjectName("");
    setDialogMode(mode);
  }

  function createProject(name: string, sourceType: Project["source"]) {
    if (!name.trim()) return;
    const next = addProject(library, name, sourceType);
    setLibrary(next);
    selectChat(next.projects.at(-1)!.chats[0]);
    setDialogMode(null);
    setNotice("项目已加入本地项目库。");
  }

  function replay() {
    setEventCount(0);
    setDecision("");
    setPlaying(true);
    setNotice("正在回放本地预览状态。");
  }

  function send() {
    if (liveMode) {
      const submitted = liveDraft.trim();
      if (!submitted || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(liveWorkspaceId)
        || !["idle", "terminal"].includes(liveController.current!.state.phase)) return;
      const idempotencyKey = `web:${crypto.randomUUID()}`;
      if (!liveStorage || !saveLiveSession(liveStorage, { kind: "pending", workspaceId: liveWorkspaceId, idempotencyKey })) {
        setNotice("浏览器无法保存提交保护标记，已取消发送以避免无法安全恢复。");
        return;
      }
      setLiveMessage(submitted);
      setLiveDraft("");
      setNotice("");
      setPendingSubmission(true);
      setKnownRunRecord(false);
      void liveController.current!.start({
        schemaVersion: TURN_COMMAND_REQUEST_SCHEMA_VERSION,
        workspaceId: liveWorkspaceId,
        idempotencyKey,
        message: submitted,
      });
      return;
    }
    if (!draft.trim() || playing) return;
    const submitted = draft.trim();
    setMessage(submitted);
    setDraft("");
    setLibrary((current) => ({
      ...current,
      projects: current.projects.map((project) => ({
        ...project,
        chats: project.chats.map((chat) => chat.id === current.activeId && chat.title === "新对话" ? { ...chat, title: submitted.slice(0, 36) } : chat),
      })),
    }));
    replay();
  }

  function renderEvent(event: PublicRunEvent): React.ReactNode {
    switch (event.kind) {
      case "run_status_changed": return <p className="event-line">状态更新 · {labels[event.payload.status]} {event.payload.reason && <code>{event.payload.reason}</code>}</p>;
      case "assistant_text_delta": return <div className="event-card"><strong>Meliora</strong><p>{event.payload.delta}</p></div>;
      case "plan_updated": return <section className="event-card"><h3>执行计划</h3><ul>{event.payload.steps.map((step) => <li key={step.id}><span className="pill">{labels[step.status]}</span>{step.title}</li>)}</ul></section>;
      case "tool_call_presented": return <section className="event-card tool-card"><div><code>{event.payload.toolName}</code><span className="pill">{event.payload.risk}</span></div><p>{event.payload.summary}</p><small>{event.payload.invocationId}</small></section>;
      case "tool_result_presented": return <section className={`event-card ${event.payload.status}`}><div><strong>工具结果</strong><span className="pill">{labels[event.payload.status]}</span></div><p>{event.payload.summary}</p><small>{event.payload.invocationId}</small></section>;
      case "approval_requested": {
        const expired = Boolean(event.payload.expiresAt && Date.parse(event.payload.expiresAt) <= Date.now());
        return <section className="event-card approval"><h3>需要审批</h3><p>{event.payload.summary}</p><code>{event.payload.argumentsHash}</code>{(expired || liveMode) && <p className="expired-approval">{liveMode ? "当前页面尚未接入真实审批操作，请勿将此状态视为已授权。" : "此历史审批已过期，当前仅供查看。"}</p>}{!liveMode && <div className="inline-actions"><button className="primary" disabled={expired || Boolean(decision)} onClick={() => setDecision("已记录允许选择，当前预览不会执行修改。")}>允许本次</button><button disabled={expired || Boolean(decision)} onClick={() => setDecision("已记录拒绝选择，当前预览不会执行修改。")}>拒绝</button></div>}{!liveMode && decision && <p role="status">{decision}</p>}</section>;
      }
      case "verification_updated": return <p className="event-line success">验证 · {labels[event.payload.status]} · {event.payload.verificationId}</p>;
      case "context_compacted": return <section className="event-card"><h3>上下文已整理</h3><p>{event.payload.summary}</p></section>;
      case "run_completed": return <section className="event-card completed"><small>FINAL OUTCOME</small><h3>任务已完成</h3><p>{event.payload.summary}</p></section>;
      case "run_failed": return <section className="event-card failed"><h3>任务失败</h3><p>{event.payload.message}</p><code>{event.payload.code}</code></section>;
      case "run_cancelled": return <section className="event-card"><h3>任务已取消</h3><p>{event.payload.reason}</p></section>;
      case "run_blocked": return <section className="event-card approval"><h3>任务已阻塞</h3><p>{event.payload.message}</p><ul>{event.payload.userActions.map((action) => <li key={action}>{action}</li>)}</ul></section>;
      default: { const neverEvent: never = event; return neverEvent; }
    }
  }

  return <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""} ${rightCollapsed ? "right-collapsed" : ""} ${mobilePanel === "nav" ? "mobile-nav-open" : ""} ${mobilePanel === "code" ? "mobile-code-open" : ""}`}>
    <aside className="left-panel"><Sidebar library={library} collapsed={collapsed} theme={theme} userName={userName} userAvatar={userAvatar} onSelect={(id) => { openChat(id); setMobilePanel(null); }} onCollapse={() => window.matchMedia(SINGLE_PANE_MEDIA).matches ? setMobilePanel(null) : setCollapsed((value) => !value)} onNewAgent={() => { createAgent(); setMobilePanel(null); }} onNewProject={() => showDialog("project")} onTheme={setTheme} onAutomations={() => showDialog("automations")} onCustomize={() => showDialog("customize")} onReveal={() => setMobilePanel("nav")}/></aside>

    <main className="center-panel">
      <header className="conversation-header"><button className="mobile-panel-button mobile-nav-trigger" aria-label="打开导航" onClick={() => setMobilePanel("nav")}><Menu /></button><div><span>{liveMode ? liveWorkspaceId || "本地工作区" : activeProject.name}</span><b>›</b><strong>{liveMode ? "真实只读任务" : activeChat.title}</strong></div><nav aria-label="对话操作"><button className="mobile-panel-button mobile-code-trigger" aria-label="打开代码面板" onClick={() => { setRightCollapsed(false); setMobilePanel("code"); }}><PanelRightOpen /></button><button aria-label="分享" onClick={() => setNotice("分享将在连接协作服务后可用。")}><Share2 /></button><button aria-label="更多操作" onClick={() => setNotice("更多对话操作即将提供。")}><MoreHorizontal /></button></nav></header>
      <div className="run-bar"><span className={`run-status ${runStatus}`}>{liveMode ? livePhaseLabel[liveState.phase] : playing ? "生成中" : labels[runStatus as keyof typeof labels]}</span><button className="mode-switch" onClick={() => setLiveMode((value) => !value)}>{liveMode ? "真实运行" : "界面预览"} · 切换</button>{liveMode ? <><label className="workspace-field">工作区 ID <input aria-label="工作区 ID" value={liveWorkspaceId} maxLength={200} onChange={(event) => setLiveWorkspaceId(event.target.value)} disabled={Boolean(liveState.identity) && liveState.phase !== "terminal"}/></label><button disabled={!liveState.identity || !["disconnected", "error"].includes(liveState.phase)} onClick={() => { void liveController.current!.reconnect(); }}>重新连接</button></> : <><button onClick={replay}>重新回放</button><button disabled={playing || eventCount >= source.length} onClick={() => setEventCount((count) => count + 1)}>下一步</button></>}</div>

      <section className="message-stream" aria-label="消息流">
        <div className="message-column">
          {showEmpty && <section className="timeline-empty" aria-labelledby="empty-title"><span aria-hidden="true"><Sparkles /></span><h2 id="empty-title">开始一个新任务</h2><p>输入目标后，任务状态会在这里逐步呈现。</p><button onClick={() => composerInput.current?.focus()}>在输入框中开始</button></section>}
          {messages.map((item) => <article className={`message ${item.role}`} key={item.id}>
            <span className="message-author">{item.role === "assistant" ? "M" : userAvatar}</span>
            <div className="message-body">{item.role === "assistant" ? <><h2>任务执行概览</h2><p>{item.content}</p><h3>当前计划</h3><ul><li>读取任务状态</li><li>展示工具与验证状态</li><li>生成可检查的最终结果</li></ul><div className="message-actions"><button onClick={() => setNotice("已复制消息摘要。")}><Copy />复制</button><button aria-pressed={reaction === "like"} onClick={() => setReaction("like")}><ThumbsUp />点赞</button><button aria-pressed={reaction === "dislike"} onClick={() => setReaction("dislike")}><ThumbsDown />点踩</button></div></> : <p>{item.content} <a href="#composer">查看执行输入</a></p>}</div>
          </article>)}
          {liveMode && liveState.identity && <aside className="reconnect-banner"><strong>真实任务</strong><span>Run {liveState.identity.runId} · 公开事件 #{liveState.cursor}。刷新仅 GET /resume，不重新提交。</span></aside>}
          {liveMode && liveState.phase === "error" && <aside className="reconnect-banner" role="alert"><strong>连接异常</strong><span>{liveState.errorCode}。若提交结果未知，请勿新建相同任务；可检查服务端或尝试恢复。</span>{pendingSubmission && <button onClick={() => { try { liveStorage?.removeItem(LIVE_SESSION_KEY); } catch { return; } liveController.current!.state = initialLiveRunState(); setLiveState(initialLiveRunState()); setPendingSubmission(false); }}>我已核查，解除提交锁</button>}{knownRunRecord && !pendingSubmission && <button onClick={() => { try { liveStorage?.removeItem(LIVE_SESSION_KEY); } catch { return; } liveController.current!.state = initialLiveRunState(); setLiveState(initialLiveRunState()); setKnownRunRecord(false); setLiveMessage(""); }}>忘记此 Run，开始新任务</button>}</aside>}
          {!liveMode && scenarioId === "reconnecting" && <aside className="reconnect-banner"><strong>连接恢复</strong><span>从事件序号 {resumePoint(scenarioId)} 之后继续，不创建新任务。</span></aside>}
          {showLoading && <section className="timeline-loading" aria-live="polite" aria-busy="true"><span className="loading-avatar"/><div><span/><span/><span/></div><p>{liveMode ? "正在等待服务端公开事件…" : playing ? "正在读取公开事件…" : "等待公开事件…"}</p></section>}
          <div className="event-flow">{events.map((event) => <article key={event.eventId} data-event={event.kind}>{renderEvent(event)}</article>)}</div>
        </div>
      </section>

      <footer className="composer-area">{notice && <p className="notice" role="status">{notice}</p>}<form className={playing || (liveMode && ["submitting", "resuming", "connecting", "live"].includes(liveState.phase)) ? "is-thinking" : undefined} onSubmit={(event) => { event.preventDefault(); send(); }}>
        <button type="button" className="attachment-button" aria-label="添加附件" onClick={() => setNotice("附件将在文件服务连接后可用。")}><Plus /></button>
        <label className="sr-only" htmlFor="composer">输入指令</label>
        <textarea ref={composerInput} id="composer" maxLength={20_000} value={liveMode ? liveDraft : draft} onChange={(event) => liveMode ? setLiveDraft(event.target.value) : setDraft(event.target.value)} placeholder="输入指令..." onCompositionStart={() => { composerComposing.current = true; }} onCompositionEnd={() => { composerComposing.current = false; }} onFocus={() => { requestAnimationFrame(() => composerInput.current?.scrollIntoView({ block: "nearest" })); }} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !composerComposing.current && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }}/>
        <button type="button" className={`voice-button ${voiceActive ? "active" : ""}`} aria-label="语音输入" aria-pressed={voiceActive} onClick={() => setVoiceActive((value) => !value)}><Mic /></button>
        {!liveMode && <label className="model-picker"><span className="sr-only">模型</span><select value={modelName} onChange={(event) => setModelName(event.target.value)}><option>DeepSeek V3</option><option>Kimi K2</option><option>MiniMax M2</option></select></label>}
        <button className="send-button" aria-label="发送" disabled={liveMode ? !liveDraft.trim() || !liveWorkspaceId || !["idle", "terminal"].includes(liveState.phase) : !draft.trim() || playing}><ArrowUp /></button>
      </form><div className="composer-meta"><span>Agent · {liveMode ? liveWorkspaceId || "本地工作区" : activeProject.name}</span><span>{liveMode ? "模型由本地服务端配置 · 只读任务 · Ctrl/⌘ + Enter" : `${modelName} · 本地预览 · Ctrl/⌘ + Enter`}</span></div></footer>
    </main>

    <button className="mobile-backdrop" aria-label="关闭侧面板" onClick={() => setMobilePanel(null)}/>
    <aside className="right-panel"><button className="mobile-close" aria-label="关闭代码面板" onClick={() => setMobilePanel(null)}><X /></button><RightPanel projectName={liveMode ? liveWorkspaceId || "本地工作区" : activeProject.name} chatTitle={liveMode ? "真实只读任务" : activeChat.title} collapsed={rightCollapsed} onCollapse={() => setRightCollapsed((value) => !value)}/></aside>

    <dialog ref={settingsDialog} className="settings-dialog" onCancel={() => setDialogMode(null)}>
      <button className="dialog-close" aria-label="关闭设置" onClick={() => setDialogMode(null)}><X /></button>
      {dialogMode === "project" && <><h2>添加项目</h2><p>当前纯浏览器版本不申请工作区目录权限。工作区选择将在 Runtime/Server 能力接入后提供。</p><form onSubmit={(event) => { event.preventDefault(); createProject(projectName, "manual"); }}><label htmlFor="project-name">项目名称</label><input id="project-name" value={projectName} maxLength={200} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：个人网站"/><button className="primary" disabled={!projectName.trim()}>创建项目</button></form><small>这里只保存项目名称，不读取、上传或修改本地文件。</small></>}
      {dialogMode === "automations" && <><h2>自动化</h2><p>这里将展示定时任务和运行状态。连接调度服务后即可管理自动化任务。</p><button onClick={() => { setDialogMode(null); createAgent(); }}>先开始一个对话</button></>}
      {dialogMode === "customize" && <><h2>自定义</h2><form onSubmit={(event) => { event.preventDefault(); setUserName(profileName.trim() || "本地用户"); setUserAvatar(profileAvatar); setDialogMode(null); }}><label htmlFor="user-name">用户昵称</label><input id="user-name" value={profileName} maxLength={32} onChange={(event) => setProfileName(event.target.value)}/><label>头像</label><div className="avatar-options">{["张", "M", "🌱", "🐱", "🚀"].map((avatar) => <button type="button" key={avatar} aria-pressed={profileAvatar === avatar} onClick={() => setProfileAvatar(avatar)}>{avatar}</button>)}</div><button className="primary">保存</button></form></>}
    </dialog>
  </div>;
}

createRoot(document.getElementById("root")!).render(<App/>);
