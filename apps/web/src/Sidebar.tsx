import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  Folder,
  HelpCircle,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import type { Library } from "./projects";
import { SINGLE_PANE_MEDIA } from "./viewport";

interface SidebarProps {
  library: Library;
  collapsed: boolean;
  theme: "light" | "dark";
  userName: string;
  userAvatar: string;
  onSelect: (id: string) => void;
  onCollapse: () => void;
  onNewAgent: () => void;
  onNewProject: () => void;
  onTheme: (theme: "light" | "dark") => void;
  onAutomations: () => void;
  onCustomize: () => void;
  onReveal: () => void;
  productMode?: boolean;
  workspaceLabel?: string;
}

export function Sidebar(props: SidebarProps) {
  const projectList = props.library.projects;
  const userName = props.userName;
  const [search, setSearch] = useState("");
  const [closedProjects, setClosedProjects] = useState<string[]>([]);
  const projectMenu = useRef<HTMLDialogElement>(null);
  const libraryRegion = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 20, top: 160 });

  useEffect(() => {
    const currentProject = projectList.find((project) =>
      project.chats.some((chat) => chat.id === props.library.activeId),
    );
    if (currentProject) setClosedProjects((ids) => ids.filter((id) => id !== currentProject.id));
  }, [projectList, props.library.activeId]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        if (window.matchMedia(SINGLE_PANE_MEDIA).matches) props.onReveal();
        window.requestAnimationFrame(() => searchInput.current?.focus());
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [props.onReveal]);

  function openProjectMenu(x: number, y: number) {
    setMenuPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - 250)),
      top: Math.max(8, Math.min(y, window.innerHeight - 130)),
    });
    projectMenu.current?.showModal();
  }

  const query = search.trim().toLocaleLowerCase();
  const visibleProjects = projectList.filter(
    (project) =>
      project.name.toLocaleLowerCase().includes(query) ||
      project.chats.some((chat) => chat.title.toLocaleLowerCase().includes(query)),
  );

  if (props.productMode) return <>
    <div className="sidebar-user product-brand">
      <span className="user-avatar" aria-hidden="true">M</span>
      <span className="user-copy"><strong>Meliora</strong><small>只读 Coding Agent</small></span>
      <button className="icon-button collapse-button" aria-label={props.collapsed ? "展开侧栏" : "收起侧栏"} aria-expanded={!props.collapsed} onClick={props.onCollapse}>{props.collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
    </div>
    <div className="sidebar-scroll product-sidebar">
      <nav className="quick-actions" aria-label="任务操作">
        <button className="new-task-button" onClick={props.onNewAgent}><Plus />新建任务</button>
      </nav>
      <section className="product-workspace" aria-label="当前工作区">
        <div className="section-title"><span>当前项目</span></div>
        <div className="workspace-summary"><Folder aria-hidden="true"/><span><strong>{props.workspaceLabel || "Meliora 源码工作区"}</strong><small>服务端受控工作区</small></span></div>
        <div className="workspace-boundary"><ShieldCheck aria-hidden="true"/><span><strong>只读模式</strong><small>可以检查文件与 Git 状态，不会修改项目。</small></span></div>
      </section>
    </div>
    <div className="sidebar-footer">
      <div className="footer-tools">
        <button className="icon-button" aria-label={props.theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} onClick={() => props.onTheme(props.theme === "dark" ? "light" : "dark")}>{props.theme === "dark" ? <Moon /> : <Sun />}</button>
        <button className="icon-button" aria-label="使用说明" onClick={props.onCustomize}><HelpCircle /></button>
      </div>
      <nav className="collapsed-rail" aria-label="折叠导航">
        <button aria-label="新建任务" title="新建任务" onClick={props.onNewAgent}><Plus /></button>
        <button aria-label="当前项目" title={props.workspaceLabel || "当前项目"}><Folder /></button>
      </nav>
    </div>
  </>;

  return <>
      <div className="sidebar-user">
      <span className="user-avatar" role="img" aria-label={`${userName} 的头像`}>{props.userAvatar}</span>
      <span className="user-copy"><strong>{userName}</strong><small>本地工作区</small></span>
      <button className="icon-button" aria-label="打开用户菜单" onClick={props.onCustomize}><ChevronDown /></button>
      <button className="icon-button collapse-button" aria-label={props.collapsed ? "展开侧栏" : "收起侧栏"} aria-expanded={!props.collapsed} onClick={props.onCollapse}>{props.collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
    </div>

    <div className="sidebar-scroll">
      <label className="search-field"><Search aria-hidden="true"/><input ref={searchInput} aria-label="搜索项目和对话" placeholder="搜索" value={search} onChange={(event) => setSearch(event.target.value)}/><kbd title="Ctrl/⌘ + Shift + K">⇧⌘K</kbd></label>
      <nav className="quick-actions" aria-label="快捷操作">
        <button aria-label="新建对话" onClick={props.onNewAgent}><Plus />新建</button>
        <button onClick={props.onAutomations}><Clock3 />自动化</button>
        <button onClick={props.onCustomize}><Sparkles />自定义</button>
      </nav>

      <section className="repository-list" aria-label="存储库" ref={libraryRegion} tabIndex={0}
        onContextMenu={(event) => { event.preventDefault(); openProjectMenu(event.clientX, event.clientY); }}
        onKeyDown={(event) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); openProjectMenu(rect.left + 18, rect.top + 38); } }}>
        <div className="section-title"><span>存储库</span><button className="icon-button" aria-label="添加存储库" onClick={props.onNewProject}><Plus /></button></div>
        {visibleProjects.map((project) => {
          const expanded = !closedProjects.includes(project.id) || Boolean(query);
          return <div className="repository" key={project.id}>
            <button className="repository-title" aria-expanded={expanded} onClick={() => setClosedProjects((ids) => ids.includes(project.id) ? ids.filter((id) => id !== project.id) : [...ids, project.id])}>
              <span className={`chevron ${expanded ? "expanded" : ""}`}>{expanded ? <ChevronDown /> : <ChevronRight />}</span><Folder aria-hidden="true"/><strong>{project.name}</strong>
            </button>
            <div className={`chat-tree ${expanded ? "expanded" : ""}`}><nav aria-label={`${project.name} 的对话`}>
              {project.chats.filter((chat) => !query || project.name.toLocaleLowerCase().includes(query) || chat.title.toLocaleLowerCase().includes(query)).map((chat) =>
                <button key={chat.id} className={`chat-row ${props.library.activeId === chat.id ? "selected" : ""}`} aria-current={props.library.activeId === chat.id ? "page" : undefined} onClick={() => props.onSelect(chat.id)}>
                  <span>{chat.title}</span><small>{chat.count ? `${chat.count}步` : "现在"}</small>
                </button>)}
            </nav></div>
          </div>;
        })}
        {!visibleProjects.length && <p className="empty-copy">没有匹配的项目或对话。</p>}
        <button className="add-repository" onClick={props.onNewProject}>右键或点击添加项目</button>
      </section>
    </div>

      <div className="sidebar-footer">
      <div className="footer-tools">
        <button className="icon-button" aria-label={props.theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} onClick={() => props.onTheme(props.theme === "dark" ? "light" : "dark")}>{props.theme === "dark" ? <Moon /> : <Sun />}</button>
        <button className="icon-button" aria-label="支持"><HelpCircle /></button>
        <button className="icon-button" aria-label="设置" onClick={props.onCustomize}><Settings /></button>
      </div>
      <nav className="collapsed-rail" aria-label="折叠导航">
        <button aria-label="新建对话" title="新建对话" onClick={props.onNewAgent}><Plus /></button>
        <button aria-label="存储库" title="存储库" onClick={props.onNewProject}><Folder /></button>
        <button aria-label="自动化" title="自动化" onClick={props.onAutomations}><Clock3 /></button>
        <button aria-label="设置" title="设置" onClick={props.onCustomize}><Settings /></button>
      </nav>
      </div>

    <dialog ref={projectMenu} className="project-menu" aria-label="存储库操作" style={{left: menuPosition.left, top: menuPosition.top}}
      onClick={(event) => { if (event.target === event.currentTarget) projectMenu.current?.close(); }} onClose={() => libraryRegion.current?.focus()}>
      <button onClick={() => { projectMenu.current?.close(); props.onNewProject(); }}><Plus /> 创建项目</button>
      <button onClick={() => projectMenu.current?.close()}>取消</button>
    </dialog>
  </>;
}
