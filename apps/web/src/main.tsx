import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PublicRunEvent } from "../../../packages/agent-runtime/public-events";
import { Sidebar } from "./Sidebar";
import { RightPanel } from "./RightPanel";
import { addProject, defaultLibrary, newChat, parseLibrary, type Chat, type Library, type Project } from "./projects";
import { labels, publicEvents, resumePoint, scenarios, statusOf, streamFor, type Scenario } from "./replay";
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

function App() {
  const [library, setLibrary] = useState<Library>(initialProjectList);
  const [scenarioId, setScenarioId] = useState<Scenario>(initialChat.scenario);
  const [eventCount, setEventCount] = useState(initialChat.count);
  const [message, setMessage] = useState(initialChat.message);
  const [draft, setDraft] = useState(initialChat.draft);
  const [decision, setDecision] = useState(initialChat.decision);
  const [playing, setPlaying] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"nav" | "code" | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeVisible, setNoticeVisible] = useState(true);
  const [voiceActive, setVoiceActive] = useState(false);
  const [modelName, setModelName] = useState("DeepSeek V3");
  const [reaction, setReaction] = useState<"like" | "dislike" | "">("");
  const [theme, setTheme] = useState<"light" | "dark">(() => savedPreference("meliora-theme-v2", "dark") === "light" ? "light" : "dark");
  const [userName, setUserName] = useState(() => savedPreference("meliora-user-name", "张子恒"));
  const [userAvatar, setUserAvatar] = useState(() => savedPreference("meliora-user-avatar", "张"));
  const [dialogMode, setDialogMode] = useState<"project" | "automations" | "customize" | null>(null);
  const [projectName, setProjectName] = useState("");
  const [profileName, setProfileName] = useState(userName);
  const [profileAvatar, setProfileAvatar] = useState(userAvatar);
  const [folderError, setFolderError] = useState("");
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);

  const projectList = library.projects;
  const activeProject = projectList.find((project) => project.chats.some((chat) => chat.id === library.activeId))!;
  const activeChat = activeProject.chats.find((chat) => chat.id === library.activeId)!;
  const source = streamFor(scenarioId);
  const events = publicEvents(source.slice(0, eventCount));
  const runStatus = statusOf(events, scenarioId === "reconnecting" ? "recovering" : "created");
  const scenario = scenarios.find((item) => item.id === scenarioId)!;

  const messages = [
    ...(message.trim() || events.length ? [{ id: "user-message", role: "user" as const, content: message || `${scenario.title}：请展示 ${scenario.description} 的执行过程。` }] : []),
    ...(events.length ? [{ id: "assistant-message", role: "assistant" as const, content: "我会根据公开事件逐步展示任务状态，并把工具、审批、验证和最终结果保留在可追踪的消息流中。" }] : []),
  ];
  const showEmpty = !message.trim() && events.length === 0 && !playing && scenarioId !== "reconnecting";
  const showLoading = events.length === 0 && (playing || Boolean(message.trim()));

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
    setFolderError("");
    setDialogMode(mode);
  }

  function createProject(name: string, sourceType: Project["source"]) {
    if (!name.trim()) return;
    const next = addProject(library, name, sourceType);
    setLibrary(next);
    selectChat(next.projects.at(-1)!.chats[0]);
    setDialogMode(null);
    setNotice("项目已加入本地项目库。当前演示不会上传或修改文件。");
  }

  async function pickFolder() {
    const picker = (window as unknown as { showDirectoryPicker?: (options: { mode: "read" }) => Promise<{ name: string }> }).showDirectoryPicker;
    if (!picker) { setFolderError("当前浏览器不支持文件夹选择，可先用项目名称创建。 "); return; }
    try {
      const handle = await picker.call(window, { mode: "read" });
      createProject(handle.name, "folder");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFolderError("未能选择文件夹，请重试。");
    }
  }

  function replay() {
    setEventCount(0);
    setDecision("");
    setPlaying(true);
    setNotice("正在从固定公开事件开始回放。");
  }

  function send() {
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
        return <section className="event-card approval"><h3>需要审批</h3><p>{event.payload.summary}</p><code>{event.payload.argumentsHash}</code>{expired && <p className="expired-approval">此历史审批已过期，当前仅供查看。</p>}<div className="inline-actions"><button className="primary" disabled={expired || Boolean(decision)} onClick={() => setDecision("已允许本次（演示，不会执行修改）。")}>允许本次</button><button disabled={expired || Boolean(decision)} onClick={() => setDecision("已拒绝（演示）。")}>拒绝</button></div>{decision && <p role="status">{decision}</p>}</section>;
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

  return <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""} ${mobilePanel === "nav" ? "mobile-nav-open" : ""} ${mobilePanel === "code" ? "mobile-code-open" : ""}`}>
    <aside className="left-panel"><Sidebar library={library} collapsed={collapsed} theme={theme} userName={userName} userAvatar={userAvatar} onSelect={(id) => { openChat(id); setMobilePanel(null); }} onCollapse={() => window.innerWidth <= 768 ? setMobilePanel(null) : setCollapsed((value) => !value)} onNewAgent={() => { createAgent(); setMobilePanel(null); }} onNewProject={() => showDialog("project")} onTheme={setTheme} onAutomations={() => showDialog("automations")} onCustomize={() => showDialog("customize")} onReveal={() => setMobilePanel("nav")}/></aside>

    <main className="center-panel">
      <header className="conversation-header"><button className="mobile-panel-button mobile-nav-trigger" aria-label="打开导航" onClick={() => setMobilePanel("nav")}>☰</button><div><span>{activeProject.name}</span><b>›</b><strong>{activeChat.title}</strong></div><nav aria-label="对话操作"><button className="mobile-panel-button mobile-code-trigger" aria-label="打开代码面板" onClick={() => setMobilePanel("code")}>⌘</button><button aria-label="分享" onClick={() => setNotice("分享功能等待真实服务接入。")}>↥</button><button aria-label="更多操作" onClick={() => setNotice("更多操作将在下一版接入。")}>•••</button></nav></header>
      <div className="run-bar"><span className={`run-status ${runStatus}`}>{playing ? "生成中" : labels[runStatus]}</span><span>固定公开事件</span><button onClick={replay}>重新回放</button><button disabled={playing || eventCount >= source.length} onClick={() => setEventCount((count) => count + 1)}>下一步</button></div>

      <section className="message-stream" aria-label="消息流">
        <div className="message-column">
          {showEmpty && <section className="timeline-empty" aria-labelledby="empty-title"><span aria-hidden="true">✦</span><h2 id="empty-title">开始一个新任务</h2><p>输入目标后，公开运行事件会在这里逐步呈现。</p><button onClick={() => composerInput.current?.focus()}>在输入框中开始</button></section>}
          {messages.map((item) => <article className={`message ${item.role}`} key={item.id}>
            <span className="message-author">{item.role === "assistant" ? "M" : userAvatar}</span>
            <div className="message-body">{item.role === "assistant" ? <><h2>任务执行概览</h2><p>{item.content}</p><h3>当前计划</h3><ul><li>读取公开事件</li><li>展示工具与验证状态</li><li>生成可检查的最终结果</li></ul><div className="message-actions"><button onClick={() => setNotice("已复制消息摘要（演示）。")}>□ 复制</button><button aria-pressed={reaction === "like"} onClick={() => setReaction("like")}>♡ 点赞</button><button aria-pressed={reaction === "dislike"} onClick={() => setReaction("dislike")}>▽ 点踩</button></div></> : <p>{item.content} <a href="#composer">查看执行输入</a></p>}</div>
          </article>)}
          {scenarioId === "reconnecting" && <aside className="reconnect-banner"><strong>连接恢复</strong><span>从事件序号 {resumePoint(scenarioId)} 之后继续，不创建新任务。</span></aside>}
          {showLoading && <section className="timeline-loading" aria-live="polite" aria-busy="true"><span className="loading-avatar"/><div><span/><span/><span/></div><p>{playing ? "正在读取公开事件…" : "等待公开事件…"}</p></section>}
          <div className="event-flow">{events.map((event) => <article key={event.eventId} data-event={event.kind}>{renderEvent(event)}</article>)}</div>
        </div>
      </section>

      <footer className="composer-area">{notice && <p className="notice" role="status">{notice}</p>}<form onSubmit={(event) => { event.preventDefault(); send(); }}>
        <button type="button" className="attachment-button" aria-label="添加附件" onClick={() => setNotice("附件功能等待文件服务接入。")}>＋</button>
        <label className="sr-only" htmlFor="composer">输入指令</label>
        <textarea ref={composerInput} id="composer" maxLength={20_000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="输入指令..." onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }}/>
        <button type="button" className={`voice-button ${voiceActive ? "active" : ""}`} aria-label="语音输入" aria-pressed={voiceActive} onClick={() => setVoiceActive((value) => !value)}>♩</button>
        <label className="model-picker"><span className="sr-only">模型</span><select value={modelName} onChange={(event) => setModelName(event.target.value)}><option>DeepSeek V3</option><option>Kimi K2</option><option>MiniMax M2</option></select></label>
        <button className="send-button" aria-label="发送" disabled={!draft.trim() || playing}>↑</button>
      </form><div className="composer-meta"><span>Agent · {activeProject.name}</span><span>{modelName} · 本地 Fixture · Ctrl/⌘ + Enter</span></div></footer>
    </main>

    <button className="mobile-backdrop" aria-label="关闭侧面板" onClick={() => setMobilePanel(null)}/>
    <aside className="right-panel"><button className="mobile-close" aria-label="关闭代码面板" onClick={() => setMobilePanel(null)}>×</button><RightPanel projectName={activeProject.name} chatTitle={activeChat.title} noticeVisible={noticeVisible} onCloseNotice={() => setNoticeVisible(false)}/></aside>

    <dialog ref={settingsDialog} className="settings-dialog" onCancel={() => setDialogMode(null)}>
      <button className="dialog-close" onClick={() => setDialogMode(null)}>×</button>
      {dialogMode === "project" && <><h2>添加存储库</h2><p>选择一个本地文件夹，或先用名称创建项目。</p><button className="primary" onClick={pickFolder}>选择文件夹</button>{folderError && <p role="status">{folderError}</p>}<form onSubmit={(event) => { event.preventDefault(); createProject(projectName, "manual"); }}><label htmlFor="project-name">项目名称</label><input id="project-name" value={projectName} maxLength={200} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：个人网站"/><button className="primary" disabled={!projectName.trim()}>创建项目</button></form><small>当前版本只保存文件夹名称，不读取、上传或修改其中的文件。</small></>}
      {dialogMode === "automations" && <><h2>自动化</h2><p>这里将展示定时任务和运行状态。当前版本尚未连接调度服务。</p><button onClick={() => { setDialogMode(null); createAgent(); }}>先开始一个对话</button></>}
      {dialogMode === "customize" && <><h2>自定义</h2><form onSubmit={(event) => { event.preventDefault(); setUserName(profileName.trim() || "本地用户"); setUserAvatar(profileAvatar); setDialogMode(null); }}><label htmlFor="user-name">用户昵称</label><input id="user-name" value={profileName} maxLength={32} onChange={(event) => setProfileName(event.target.value)}/><label>头像</label><div className="avatar-options">{["张", "M", "🌱", "🐱", "🚀"].map((avatar) => <button type="button" key={avatar} aria-pressed={profileAvatar === avatar} onClick={() => setProfileAvatar(avatar)}>{avatar}</button>)}</div><button className="primary">保存</button></form></>}
    </dialog>
  </div>;
}

createRoot(document.getElementById("root")!).render(<App/>);
