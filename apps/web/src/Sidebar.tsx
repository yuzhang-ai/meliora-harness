import React, { useEffect, useRef, useState } from "react";
import type { Library } from "./projects";

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
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "l") {
        event.preventDefault();
        if (window.innerWidth <= 768) props.onReveal();
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

  return <>
      <div className="sidebar-user">
      <span className="user-avatar" role="img" aria-label={`${userName} 的头像`}>{props.userAvatar}</span>
      <span className="user-copy"><strong>{userName}</strong><small>Meliora workspace</small></span>
      <button className="icon-button" aria-label="打开用户菜单" onClick={props.onCustomize}>⌄</button>
      <button className="icon-button collapse-button" aria-label={props.collapsed ? "展开侧栏" : "收起侧栏"} aria-expanded={!props.collapsed} onClick={props.onCollapse}>◧</button>
    </div>

    <div className="sidebar-scroll">
      <label className="search-field"><span aria-hidden="true">⌕</span><input ref={searchInput} aria-label="搜索项目和对话" placeholder="搜索" value={search} onChange={(event) => setSearch(event.target.value)}/><kbd>⌘L</kbd></label>
      <nav className="quick-actions" aria-label="快捷操作">
        <button onClick={props.onNewAgent}><span>＋</span>新建</button>
        <button onClick={props.onAutomations}><span>◷</span>自动化</button>
        <button onClick={props.onCustomize}><span>✦</span>自定义</button>
      </nav>

      <section className="repository-list" aria-label="存储库" ref={libraryRegion} tabIndex={0}
        onContextMenu={(event) => { event.preventDefault(); openProjectMenu(event.clientX, event.clientY); }}
        onKeyDown={(event) => { if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); openProjectMenu(rect.left + 18, rect.top + 38); } }}>
        <div className="section-title"><span>存储库</span><button className="icon-button" aria-label="添加存储库" onClick={props.onNewProject}>＋</button></div>
        {visibleProjects.map((project) => {
          const expanded = !closedProjects.includes(project.id) || Boolean(query);
          return <div className="repository" key={project.id}>
            <button className="repository-title" aria-expanded={expanded} onClick={() => setClosedProjects((ids) => ids.includes(project.id) ? ids.filter((id) => id !== project.id) : [...ids, project.id])}>
              <span className={`chevron ${expanded ? "expanded" : ""}`}>›</span><span aria-hidden="true">▱</span><strong>{project.name}</strong>
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
        <button className="add-repository" onClick={props.onNewProject}>右键或点击添加本地文件夹</button>
      </section>
    </div>

    <div className="sidebar-footer">
      <div className="footer-tools">
        <button className="icon-button" aria-label={props.theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} onClick={() => props.onTheme(props.theme === "dark" ? "light" : "dark")}>{props.theme === "dark" ? "☾" : "☼"}</button>
        <button className="icon-button" aria-label="支持">?</button>
        <button className="icon-button" aria-label="设置" onClick={props.onCustomize}>⚙</button>
      </div>
      <nav className="collapsed-rail" aria-label="折叠导航">
        <button aria-label="新建对话" title="新建对话" onClick={props.onNewAgent}>＋</button>
        <button aria-label="存储库" title="存储库" onClick={props.onNewProject}>▱</button>
        <button aria-label="自动化" title="自动化" onClick={props.onAutomations}>◷</button>
        <button aria-label="设置" title="设置" onClick={props.onCustomize}>⚙</button>
      </nav>
      <div className="team-card"><span className="team-avatar">M</span><span><strong>Meliora Team</strong><small>Web Product Owner</small></span><button>升级</button></div>
    </div>

    <dialog ref={projectMenu} className="project-menu" aria-label="存储库操作" style={{left: menuPosition.left, top: menuPosition.top}}
      onClick={(event) => { if (event.target === event.currentTarget) projectMenu.current?.close(); }} onClose={() => libraryRegion.current?.focus()}>
      <button onClick={() => { projectMenu.current?.close(); props.onNewProject(); }}>▱ 选择文件夹建立项目</button>
      <button onClick={() => projectMenu.current?.close()}>取消</button>
    </dialog>
  </>;
}
