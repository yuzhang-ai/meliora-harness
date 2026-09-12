import { publicRunEventReplays } from "../../../fixtures/contracts/v1/public-run-event-replays";
import { PUBLIC_RUN_EVENT_SCHEMA_VERSION, type PublicRunEvent } from "../../../packages/agent-runtime/public-events";
export type Scenario = keyof typeof publicRunEventReplays | "blocked" | "compacting";
export const scenarios: {id: Scenario; title: string; description: string}[] = [
  {id:"read-only-success",title:"工作区检查",description:"正常运行 · 工具调用 · 验证"},
  {id:"approval-required",title:"修改文件审批",description:"等待审批 · 参数绑定"},
  {id:"tool-failure",title:"Git 检查失败",description:"工具失败 · 可重试"},
  {id:"cancelled",title:"已取消的任务",description:"取消 · 保留执行记录"},
  {id:"reconnecting",title:"恢复断开的会话",description:"SSE 重连 · 事件去重"},
  {id:"blocked",title:"等待补充信息",description:"阻塞 · 用户下一步"},
  {id:"compacting",title:"整理任务上下文",description:"上下文压缩 · 检查点"},
];
const envelope = (id: string) => ({schemaVersion:PUBLIC_RUN_EVENT_SCHEMA_VERSION,eventId:"web-demo-"+id,sessionId:"web-demo-"+id,runId:"web-demo-"+id,sequence:1,timestamp:"2026-09-12T00:00:00.000Z",visibility:"public" as const});
export function streamFor(id:Scenario): readonly PublicRunEvent[] {
  // Supplemental UI-only examples use existing contracts, never modify shared fixtures.
  if(id==="blocked") return [{...envelope(id),kind:"run_blocked",payload:{code:"workspace_selection_required",message:"尚未选择可用的工作区，任务暂时无法继续。",userActions:["确认工作区目录。","接入真实服务后，重新提交任务。"]}}];
  if(id==="compacting") return [{...envelope(id),kind:"context_compacted",payload:{checkpointId:"web-demo-checkpoint",summary:"已保存目标、约束与执行进度，可从检查点继续。"}}];
  return publicRunEventReplays[id].events;
}
export function resumePoint(id:Scenario) { return id==="reconnecting" ? publicRunEventReplays.reconnecting.resumeAfterSequence : 0; }
export function publicEvents(events:readonly PublicRunEvent[]):PublicRunEvent[] {
  const ids=new Set<string>(); const sequences=new Set<number>();
  return [...events].filter(e=>e.visibility==="public" && e.schemaVersion===PUBLIC_RUN_EVENT_SCHEMA_VERSION).sort((a,b)=>a.sequence-b.sequence).filter(e=>{
    if(ids.has(e.eventId)||sequences.has(e.sequence)) return false;
    ids.add(e.eventId); sequences.add(e.sequence); return true;
  });
}
export const labels:Record<string,string>={recovering:"状态待恢复",created:"未开始",preparing:"准备中",model_streaming:"正在回复",tool_assembling:"准备工具",awaiting_approval:"等待审批",executing_tools:"工具运行中",compacting:"整理上下文",verifying:"验证中",completed:"已完成",failed:"失败",cancelled:"已取消",blocked:"已阻塞",succeeded:"成功",passed:"验证通过",not_run:"未验证",pending:"待处理",in_progress:"进行中",skipped:"已跳过"};
export function statusOf(events:readonly PublicRunEvent[], baseline="created") {
  let status=baseline;
  for(const e of events) {
    if(e.kind==="run_status_changed") status=e.payload.status;
    else if(e.kind==="run_completed") status="completed";
    else if(e.kind==="run_failed") status="failed";
    else if(e.kind==="run_cancelled") status="cancelled";
    else if(e.kind==="run_blocked") status="blocked";
    else if(e.kind==="approval_requested") status="awaiting_approval";
    else if(e.kind==="tool_call_presented") status="executing_tools";
    else if(e.kind==="assistant_text_delta") status="model_streaming";
    else if(e.kind==="verification_updated") status="verifying";
    else if(e.kind==="context_compacted") status="compacting";
  }
  return status;
}
