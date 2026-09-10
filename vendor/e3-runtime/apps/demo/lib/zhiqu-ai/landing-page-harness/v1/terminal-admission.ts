import type { ToolInvocationReceiptV1 } from "./contracts";
import {
  LANDING_PAGE_GOVERNANCE_V1,
  assessTurnOutcomeProposalV1,
  decodeGoalContractV1,
  decodeTurnOutcomeProposalV1,
  type ClaimGateFactsV1,
  type FinalClaimEffectV1,
  type GoalContractV1,
  type TurnOutcomeProposalV1,
} from "./governance-contracts";
import { hashCanonicalJsonV1, strictRecordV1 } from "./strict-json";
import type { ToolDescriptorV1 } from "./tools";

export const TERMINAL_PROPOSAL_SELF_EVIDENCE_V1 = "terminal-proposal:self";

export const CANONICAL_CAPABILITY_DEGRADED_DELIVERY_V1 =
  "当前请求所需能力尚未接通，本轮无法完成这项操作。我没有写入、保存、预览或发布页面；可以继续提供不依赖该能力的方案。若需要直接操作，请联系技术负责人或等待能力升级。";

export const isUnavailableCapabilityReceiptV1 = (
  receipt: ToolInvocationReceiptV1,
  descriptors?: readonly Pick<ToolDescriptorV1, "toolId" | "version">[]
) =>
  receipt.toolId !== "submit_turn_outcome" &&
  receipt.status === "unavailable" &&
  receipt.retryDisposition === "do_not_retry" &&
  receipt.toolVersion !== "unavailable" &&
  (!descriptors ||
    descriptors.some(
      (descriptor) =>
        descriptor.toolId === receipt.toolId &&
        descriptor.version === receipt.toolVersion
    ));

export const CANONICAL_ADVISORY_DELIVERY_V1 =
  "本轮已完成经治理合同验证的建议整理。当前安全交付层不会直接转发模型草稿。";

export type H1TriggerIntentClassV1 =
  | "read_only"
  | "requires_unavailable";

const H1_NEGATION_V1 =
  /(?:不要|请勿|无需|不需要|不必|不能|不可|别)|\b(?:do\s+not|don't|dont|never|without)\b/iu;
const H1_CHINESE_MUTATION_V1 =
  /(?:修改|更改|改动|改成|改为|换成|换为|换掉|替换|删除|删掉|移除|撤掉|新增|添加|插入|移动|挪到|挪动|调整|设置|设为|设成|定为|变成|弄成|染成|写入|写成|生成|创建|重命名|复制|克隆|粘贴|拖拽|排序|对齐|旋转|裁剪|隐藏|藏起来|显示|消失|关掉|打开|清空|上传|导入|优化|美化|完善|修复|实现|保存|发布|预览|撤销|重做|调到|调成)/u;
const H1_ENGLISH_MUTATION_V1 =
  /\b(?:modify|edit|change|update|replace|recolor|delete|remove|clear|add|insert|move|resize|hide|show|activate|deactivate|enable|disable|duplicate|clone|save|publish|preview|undo|redo|set|rename|reorder|reparent|create|write|generate|copy|paste|drag|align|rotate|crop|upload|import|optimi[sz]e|polish|improve|fix|build|implement|make|turn)\b/iu;
const H1_CHINESE_READ_V1 =
  /(?:读取|读一下|读下|读(?=(?:当前)?(?:画布|页面|图层|选中|选区|元素|节点|结构|属性|容器|组件|按钮|文案|标题|布局|事实|数量|快照))|查看|看看|看一下|看下|看(?=(?:当前)?(?:画布|页面|图层|选中|选区|元素|节点|结构|属性|容器|组件|按钮|文案|标题|布局|事实|数量|快照))|检查|检视|分析|总结|概括|描述|列出|统计|查询|识别|告诉我|说明|回答|汇报|反馈|审计|比较|查找|寻找)/u;
const H1_ENGLISH_READ_V1 =
  /\b(?:read|inspect|view|check|analy[sz]e|summari[sz]e|describe|list|count|query|identify|show|tell|explain|answer|respond|audit|compare|find|report)\b/iu;
const H1_CANVAS_SCOPE_V1 =
  /(?:当前画布|画布|当前页面|页面|图层|选中|选区|元素|节点|结构|属性|容器|组件|按钮|文案|标题|布局|事实|数量|快照)|\b(?:canvas|page|layer|selection|selected|node|element|structure|property|container|component|tree|button|cta|label|copy|title|layout|fact|count|snapshot)\b/iu;

const maskQuotedLiteralsV1 = (message: string) =>
  message.replace(
    /“[^”]*”|‘[^’]*’|「[^」]*」|『[^』]*』|"[^"]*"|'[^']*'|`[^`]*`/gu,
    " quoted_literal "
  );

const firstPatternIndexV1 = (
  value: string,
  patterns: readonly RegExp[]
) => {
  const indices = patterns
    .map((pattern) => pattern.exec(value)?.index ?? -1)
    .filter((index) => index >= 0);
  return indices.length ? Math.min(...indices) : -1;
};

const segmentHasAffirmativeActionV1 = (
  segment: string,
  patterns: readonly RegExp[]
) => {
  const actionIndex = firstPatternIndexV1(segment, patterns);
  if (actionIndex < 0) return false;
  return !H1_NEGATION_V1.test(segment.slice(0, actionIndex));
};

const isEnglishNegatedBareMutationHeadV1 = (segment: string) =>
  /^(?:do\s+not|don't|dont|never)\s+(?:just\s+)?(?:modify|edit|change|update|save|publish|preview)$/iu.test(
    segment.trim()
  );

const isEnglishBareMutationContinuationV1 = (segment: string) =>
  /^(?:(?:and|or)\s+)?(?:modify|edit|change|update|save|publish|preview)$/iu.test(
    segment.trim()
  );

const isChineseBareMutationContinuationV1 = (segment: string) => {
  const withoutMutationWords = segment
    .trim()
    .replace(new RegExp(H1_CHINESE_MUTATION_V1.source, "gu"), "")
    .replace(/(?:并|或|和|以及|及|、|\s)+/gu, "");
  return withoutMutationWords.length === 0;
};

const hasAffirmativeMutationV1 = (message: string) =>
  message.split(/[。！？；.!?;\n]+/u).some((clause) => {
    let englishNegatedBareList = false;
    for (const segment of clause.split(/[，,]+/u)) {
      const mutationIndex = firstPatternIndexV1(segment, [
        H1_CHINESE_MUTATION_V1,
        H1_ENGLISH_MUTATION_V1,
      ]);
      if (mutationIndex < 0) {
        englishNegatedBareList = false;
        continue;
      }
      if (H1_NEGATION_V1.test(segment.slice(0, mutationIndex))) {
        englishNegatedBareList =
          isEnglishNegatedBareMutationHeadV1(segment);
        continue;
      }
      if (
        englishNegatedBareList &&
        isEnglishBareMutationContinuationV1(segment)
      )
        continue;
      return true;
    }
    return false;
  });

const hasExplicitReadIntentV1 = (message: string) =>
  H1_CANVAS_SCOPE_V1.test(message) &&
  message
    .split(/[。！？；.!?;，,\n]+/u)
    .some((segment) =>
      segmentHasAffirmativeActionV1(segment, [
        H1_CHINESE_READ_V1,
        H1_ENGLISH_READ_V1,
      ])
    );

const H1_ACTION_CONTINUATION_SPLIT_V1 =
  /(?:[。！？；.!?;，,\n]+|\b(?:and\s+then|after\s+that|then|and|but|while|also|meanwhile|plus|to|subsequently|afterwards)\b|(?:然后|随后|接着|继而|同时|顺便|顺手|之后|后(?=(?:再|请|帮|把|将|让|给|使|令|移|删|改|调|设|定|换|关|开|藏|清))|再|并且|而且|但是|并|但|且))/iu;
const H1_NEGATED_CONSTRAINT_HEAD_V1 =
  /^(?:请)?(?:不要|请勿|无需|不需要|不必|不能|不可|别)|^(?:please\s+)?(?:do\s+not|don't|dont|never|without)\b/iu;
const H1_SAFE_POST_READ_REPORT_V1 =
  /^(?:(?:把|将)(?:(?:读取|读|查看|看到)到?的|上述|这些|当前)?(?:页面|画布)?(?:结果|事实|摘要|结构|信息|内容)(?:清楚地)?(?:告诉我|说明|列出|展示|回答|汇报|反馈)|让(?:我)?(?:知道|了解|看到)|给我(?:说明|列出|展示|回答|汇报|反馈|看看|看一下|看下))/u;

/**
 * A B2 read may include another explicit read operation (for example
 * "read ... and summarize") or a pure negative constraint. Any other
 * continuation after the admitted read is treated as an unknown action and
 * therefore fails closed. This prevents an open-ended mutation vocabulary
 * from turning "read, then <new edit verb>" into an Actor call.
 */
const hasUnsafePostReadContinuationV1 = (message: string) => {
  const segments = message.split(H1_ACTION_CONTINUATION_SPLIT_V1);
  let readSeen = false;
  let negatedBareMutationList = false;
  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    if (!segment) continue;
    const segmentHasRead = segmentHasAffirmativeActionV1(segment, [
      H1_CHINESE_READ_V1,
      H1_ENGLISH_READ_V1,
    ]);
    if (segmentHasRead) {
      readSeen = true;
      negatedBareMutationList = false;
      continue;
    }
    if (!readSeen) continue;
    if (H1_SAFE_POST_READ_REPORT_V1.test(segment)) continue;
    if (H1_NEGATED_CONSTRAINT_HEAD_V1.test(segment)) {
      negatedBareMutationList =
        H1_CHINESE_MUTATION_V1.test(segment) ||
        H1_ENGLISH_MUTATION_V1.test(segment);
      continue;
    }
    if (
      negatedBareMutationList &&
      (isEnglishBareMutationContinuationV1(segment) ||
        isChineseBareMutationContinuationV1(segment))
    ) {
      continue;
    }
    return true;
  }
  return false;
};

const H1_CHINESE_POST_READ_ACTION_OPERATOR_V1 =
  /(?:把|将|使|令)|让(?!我(?:知道|了解|看到|看看|看一下|看下))|给(?!我(?:说明|列出|展示|回答|汇报|反馈|看看|看一下|看下))/u;

/**
 * Chinese object/cause markers are a stronger signal than an endlessly
 * growing mutation synonym list. Once an explicit read has started, a later
 * 把/将/让/使/令/给 structure is unavailable unless it is the narrow,
 * explicit act of reporting the read result back to the user.
 */
const hasUnsafePostReadActionOperatorV1 = (message: string) => {
  const readMatch = H1_CHINESE_READ_V1.exec(message);
  if (!readMatch) return false;
  const suffix = message.slice(readMatch.index + readMatch[0].length);
  const operatorMatch = H1_CHINESE_POST_READ_ACTION_OPERATOR_V1.exec(suffix);
  if (!operatorMatch) return false;
  return !H1_SAFE_POST_READ_REPORT_V1.test(suffix.slice(operatorMatch.index));
};

/**
 * B2 is intentionally fail closed: only an explicit read action over an
 * explicit canvas/page scope may enter the Actor. Every mutation, unsupported
 * action, or ambiguous trigger closes through a Host-owned unavailable
 * Receipt. The decision is derived from the immutable trigger message and
 * never trusts the Actor's Goal.
 */
export const classifyH1TriggerIntentV1 = (
  message: string
): H1TriggerIntentClassV1 => {
  const normalized = maskQuotedLiteralsV1(
    message.normalize("NFKC").toLowerCase()
  );
  return !hasAffirmativeMutationV1(normalized) &&
    hasExplicitReadIntentV1(normalized) &&
    !hasUnsafePostReadContinuationV1(normalized) &&
    !hasUnsafePostReadActionOperatorV1(normalized)
    ? "read_only"
    : "requires_unavailable";
};

const sameRunAsTerminalV1 = (
  receipt: ToolInvocationReceiptV1,
  terminalReceipt: ToolInvocationReceiptV1
) =>
  receipt.workspaceId === terminalReceipt.workspaceId &&
  receipt.sessionId === terminalReceipt.sessionId &&
  receipt.threadId === terminalReceipt.threadId &&
  receipt.turnId === terminalReceipt.turnId &&
  receipt.runId === terminalReceipt.runId;

const isUnavailableCanvasMutationObservationV1 = (observation: string) => {
  try {
    const record = strictRecordV1(
      JSON.parse(observation) as unknown,
      ["capability", "state", "reason", "truthfulNextStep"],
      "inspect_ux_capability.observation"
    );
    return (
      record.capability === "canvasMutation" &&
      record.state === "unavailable" &&
      record.reason === "ux_provider_unavailable" &&
      typeof record.truthfulNextStep === "string" &&
      record.truthfulNextStep.trim().length > 0
    );
  } catch {
    return false;
  }
};

const canonicalH1GroundedReadAnswerV1 = (
  proposal: TurnOutcomeProposalV1,
  receipts: readonly ToolInvocationReceiptV1[],
  terminalReceipt: ToolInvocationReceiptV1
) => {
  const h1Receipts = receipts.filter(
    (receipt) =>
      sameRunAsTerminalV1(receipt, terminalReceipt) &&
      receipt.toolId === "canvas_inspect" &&
      receipt.toolVersion === "h1-effective-facts-inspect-v1" &&
      receipt.status === "completed"
  );
  const allowedEvidence = new Set(
    h1Receipts.map((receipt) => `tool-call:${receipt.callId}`)
  );
  if (
    h1Receipts.length < 1 ||
    proposal.outcome !== "fulfilled" ||
    proposal.unresolvedRequirementIds.length !== 0 ||
    proposal.finalClaims.length < 1 ||
    proposal.finalClaims.some(
      (claim) =>
        claim.effect !== "read" ||
        claim.state !== "completed" ||
        claim.evidenceRefs.length < 1 ||
        claim.evidenceRefs.some((evidenceRef) => !allowedEvidence.has(evidenceRef))
    )
  ) {
    return null;
  }
  const referencedEvidence = new Set(
    proposal.finalClaims.flatMap((claim) => claim.evidenceRefs)
  );
  const views: Array<
    Readonly<{
      scope: string;
      source: Readonly<Record<string, string>>;
      facts: unknown;
    }>
  > = [];
  for (const receipt of h1Receipts) {
    if (!referencedEvidence.has(`tool-call:${receipt.callId}`)) continue;
    let observation: unknown;
    try {
      observation = JSON.parse(receipt.observation) as unknown;
    } catch {
      return null;
    }
    if (
      !observation ||
      typeof observation !== "object" ||
      Array.isArray(observation)
    )
      return null;
    const record = observation as Record<string, unknown>;
    const provenance = record.provenance;
    if (
      record.kind !== "h1_effective_facts_inspect_result" ||
      typeof record.contractVersion !== "string" ||
      typeof record.scope !== "string" ||
      !["summary", "selection", "nodes"].includes(record.scope) ||
      !provenance ||
      typeof provenance !== "object" ||
      Array.isArray(provenance) ||
      !Object.hasOwn(record, "payload")
    )
      return null;
    const source = provenance as Record<string, unknown>;
    const safeSource = {
      freshness: source.freshness,
      routePath: source.routePath,
      captureProfile: source.captureProfile,
      documentId: source.documentId,
      viewport: source.viewport,
      observedAt: source.observedAt,
    };
    if (Object.values(safeSource).some((item) => typeof item !== "string"))
      return null;
    views.push({
      scope: record.scope,
      source: safeSource as Record<string, string>,
      facts: record.payload,
    });
  }
  if (!views.length) return null;
  const json = JSON.stringify(
    views.length === 1 ? views[0] : views,
    null,
    2
  ).replaceAll("`", "\\u0060");
  const answer = `已读取提交时的受限画布事实：\n\n\`\`\`json\n${json}\n\`\`\``;
  return new TextEncoder().encode(answer).byteLength <= 16_000
    ? answer
    : null;
};

export const CANONICAL_REPEATED_TOOL_FAILURE_DELIVERY_V1 =
  "本轮工具调用连续失败，Host 已停止自动重试。本轮未完成目标，也没有执行页面写入、保存、预览或发布；请检查工具输入或连接后重试。";

export const PRE_GOVERNANCE_HISTORY_NOTICE_V1 =
  "该历史运行生成于终局治理接入前，无法验证其完成状态；原始模型文本已从公开视图隐藏。";

export type TerminalAdmissionResultV1 = Readonly<
  | {
      accepted: true;
      canonicalOutput: string;
      outcome: string;
      rejectionCodes: readonly [];
      goal: GoalContractV1;
      proposal: TurnOutcomeProposalV1;
      claimGateAssessmentHash: string;
      evidenceReceiptCallIds: readonly string[];
    }
  | {
      accepted: false;
      canonicalOutput: null;
      outcome: string | null;
      rejectionCodes: readonly string[];
      goal: null;
      proposal: null;
      claimGateAssessmentHash: null;
      evidenceReceiptCallIds: readonly string[];
    }
>;

export const toolDescriptorFingerprintV1 = (
  descriptors: readonly ToolDescriptorV1[]
) =>
  hashCanonicalJsonV1(
    descriptors
      .map(({ toolId, version, description, effect, inputSchema }) => ({
        toolId,
        version,
        description,
        effect,
        inputSchema,
      }))
      .sort((left, right) => left.toolId.localeCompare(right.toolId))
  );

export const decodeTerminalProposalArgumentsV1 = (argumentsJson: string) => {
  const parsed = JSON.parse(argumentsJson) as unknown;
  const record = strictRecordV1(
    parsed,
    ["goal", "proposal"],
    "submit_turn_outcome.arguments"
  );
  const goalValue =
    typeof record.goal === "string"
      ? (JSON.parse(record.goal) as unknown)
      : record.goal;
  const proposalValue =
    typeof record.proposal === "string"
      ? (JSON.parse(record.proposal) as unknown)
      : record.proposal;
  return {
    goal: decodeGoalContractV1(goalValue),
    proposal: decodeTurnOutcomeProposalV1(proposalValue),
  };
};

const canonicalizeH1EvidenceAliasesV1 = (input: Readonly<{
  proposal: TurnOutcomeProposalV1;
  terminalReceipt: ToolInvocationReceiptV1;
  receipts: readonly ToolInvocationReceiptV1[];
  descriptors: readonly Pick<ToolDescriptorV1, "toolId" | "version" | "effect">[];
}>) => {
  const candidates = input.receipts.filter(
    (receipt) =>
      sameRunAsTerminalV1(receipt, input.terminalReceipt) &&
      receipt.toolId === "canvas_inspect" &&
      receipt.toolVersion === "h1-effective-facts-inspect-v1" &&
      receipt.status === "completed" &&
      effectForReceipt(receipt, input.descriptors) === "read"
  );
  const receiptIdCounts = new Map<string, number>();
  const callIdCounts = new Map<string, number>();
  for (const receipt of candidates) {
    receiptIdCounts.set(
      receipt.receiptId,
      (receiptIdCounts.get(receipt.receiptId) ?? 0) + 1
    );
    callIdCounts.set(
      receipt.callId,
      (callIdCounts.get(receipt.callId) ?? 0) + 1
    );
  }
  const byReceiptAlias = new Map<string, ToolInvocationReceiptV1>();
  for (const receipt of candidates) {
    byReceiptAlias.set(receipt.receiptId, receipt);
    // Some providers preserve the exact Host Receipt ID but annotate its
    // evidence family. This finite alias is still accepted only when it maps
    // to one exact same-Run completed H1 read Receipt below; no prefix or
    // substring search is permitted.
    byReceiptAlias.set(`canvas:${receipt.receiptId}`, receipt);
  }
  return {
    ...input.proposal,
    finalClaims: input.proposal.finalClaims.map((claim) => {
      const evidenceRefs = claim.evidenceRefs.map((evidenceRef) => {
        const receipt = byReceiptAlias.get(evidenceRef);
        if (
          !receipt ||
          receiptIdCounts.get(receipt.receiptId) !== 1 ||
          callIdCounts.get(receipt.callId) !== 1 ||
          effectForReceipt(receipt, input.descriptors) !== claim.effect
        )
          return evidenceRef;
        return `tool-call:${receipt.callId}`;
      });
      if (new Set(evidenceRefs).size !== evidenceRefs.length)
        throw new Error("terminal_evidence_alias_collision");
      return { ...claim, evidenceRefs };
    }),
  } as TurnOutcomeProposalV1;
};

const effectForReceipt = (
  receipt: ToolInvocationReceiptV1,
  descriptors: readonly Pick<ToolDescriptorV1, "toolId" | "version" | "effect">[]
): FinalClaimEffectV1 | null => {
  const descriptor = descriptors.find(
    (item) =>
      item.toolId === receipt.toolId && item.version === receipt.toolVersion
  );
  if (receipt.status !== "completed" || !descriptor) return null;
  if (descriptor.effect === "read_only" || descriptor.effect === "capability_read") {
    return "read";
  }
  return null;
};

const isH1TerminalSurfaceV1 = (
  descriptors: readonly Pick<
    ToolDescriptorV1,
    "toolId" | "version" | "effect"
  >[]
) =>
  descriptors.some(
    (descriptor) =>
      descriptor.toolId === "canvas_inspect" &&
      descriptor.version === "h1-effective-facts-inspect-v1"
  ) &&
  descriptors.some(
    (descriptor) =>
      descriptor.toolId === "inspect_ux_capability" &&
      descriptor.version === "1.0.0"
  );

const h1TerminalContractRejectionV1 = (input: Readonly<{
  goal: GoalContractV1;
  proposal: TurnOutcomeProposalV1;
  terminalReceipt: ToolInvocationReceiptV1;
  receipts: readonly ToolInvocationReceiptV1[];
  descriptors: readonly Pick<
    ToolDescriptorV1,
    "toolId" | "version" | "effect"
  >[];
  triggerMessageContent?: string;
}>) => {
  if (!isH1TerminalSurfaceV1(input.descriptors)) return null;
  const triggerMessageContent = input.triggerMessageContent;
  if (!triggerMessageContent) return "h1_trigger_binding_missing";
  if (input.goal.originalIntent !== triggerMessageContent)
    return "h1_trigger_intent_mismatch";
  if (classifyH1TriggerIntentV1(triggerMessageContent) !== "read_only")
    return "h1_trigger_requires_unavailable_capability";
  const h1Receipts = input.receipts.filter(
    (receipt) =>
      sameRunAsTerminalV1(receipt, input.terminalReceipt) &&
      receipt.toolId === "canvas_inspect" &&
      receipt.toolVersion === "h1-effective-facts-inspect-v1" &&
      receipt.status === "completed"
  );
  if (h1Receipts.length !== 1)
    return "h1_read_receipt_cardinality_invalid";
  if (input.goal.requirements.length !== 1 || input.goal.amendments.length !== 0)
    return "h1_goal_shape_invalid";
  const requirement = input.goal.requirements[0]!;
  if (
    requirement.requiredEffects.length !== 1 ||
    requirement.requiredEffects[0] !== "read"
  )
    return "h1_goal_effect_invalid";
  if (
    input.proposal.outcome !== "fulfilled" ||
    input.proposal.completedRequirementIds.length !== 1 ||
    input.proposal.completedRequirementIds[0] !== requirement.requirementId ||
    input.proposal.unresolvedRequirementIds.length !== 0 ||
    input.proposal.capabilityGaps.length !== 0 ||
    input.proposal.finalClaims.length !== 1
  )
    return "h1_terminal_shape_invalid";
  const claim = input.proposal.finalClaims[0]!;
  if (
    claim.effect !== "read" ||
    claim.state !== "completed" ||
    claim.requirementIds.length !== 1 ||
    claim.requirementIds[0] !== requirement.requirementId ||
    claim.evidenceRefs.length !== 1 ||
    claim.evidenceRefs[0] !== `tool-call:${h1Receipts[0]!.callId}`
  )
    return "h1_terminal_claim_invalid";
  return null;
};

export const admitTerminalProposalV1 = (input: Readonly<{
  argumentsJson: string;
  terminalReceipt: ToolInvocationReceiptV1;
  receipts: readonly ToolInvocationReceiptV1[];
  descriptors: readonly Pick<ToolDescriptorV1, "toolId" | "version" | "effect">[];
  triggerMessageContent?: string;
}>): TerminalAdmissionResultV1 => {
  try {
    if (
      input.terminalReceipt.toolId !== "submit_turn_outcome" ||
      input.terminalReceipt.status !== "completed"
    ) {
      return {
        accepted: false,
        canonicalOutput: null,
        outcome: null,
        rejectionCodes: ["terminal_receipt_invalid"],
        goal: null,
        proposal: null,
        claimGateAssessmentHash: null,
        evidenceReceiptCallIds: [],
      };
    }
    const decoded = decodeTerminalProposalArgumentsV1(input.argumentsJson);
    const goal = decoded.goal;
    const proposal = canonicalizeH1EvidenceAliasesV1({
      proposal: decoded.proposal,
      terminalReceipt: input.terminalReceipt,
      receipts: input.receipts,
      descriptors: input.descriptors,
    });
    const h1TerminalContractRejection = h1TerminalContractRejectionV1({
      goal,
      proposal,
      terminalReceipt: input.terminalReceipt,
      receipts: input.receipts,
      descriptors: input.descriptors,
      triggerMessageContent: input.triggerMessageContent,
    });
    if (h1TerminalContractRejection) {
      return {
        accepted: false,
        canonicalOutput: null,
        outcome: proposal.outcome,
        rejectionCodes: [h1TerminalContractRejection],
        goal: null,
        proposal: null,
        claimGateAssessmentHash: null,
        evidenceReceiptCallIds: [],
      };
    }
    const capabilityReceipts = input.receipts.filter(
      (receipt) =>
        receipt.toolId === "inspect_ux_capability" &&
        sameRunAsTerminalV1(receipt, input.terminalReceipt) &&
        isUnavailableCapabilityReceiptV1(receipt, input.descriptors) &&
        input.descriptors.some(
          (descriptor) =>
            descriptor.toolId === receipt.toolId &&
            descriptor.version === receipt.toolVersion &&
            descriptor.effect === "capability_read"
        ) &&
        isUnavailableCanvasMutationObservationV1(receipt.observation)
    );
    const capabilityFacts = capabilityReceipts.map((receipt) => ({
      contractVersion: LANDING_PAGE_GOVERNANCE_V1.capabilityFact,
      capabilityFactId: `capability-call:${receipt.callId}`,
      requiredCapability: "canvas-mutation",
      availability: "unavailable" as const,
      reasonCode: "ux_provider_unavailable",
      evidenceRefs: [`tool-call:${receipt.callId}`],
    }));
    const effectEvidence: ClaimGateFactsV1["effectEvidence"][number][] = [];
    for (const claim of proposal.finalClaims) {
      for (const requirementId of claim.requirementIds) {
        for (const evidenceRef of claim.evidenceRefs) {
          if (!evidenceRef.startsWith("tool-call:")) continue;
          const callId = evidenceRef.slice("tool-call:".length);
          const receipt = input.receipts.find(
            (item) =>
              item.callId === callId &&
              sameRunAsTerminalV1(item, input.terminalReceipt)
          );
          if (receipt && effectForReceipt(receipt, input.descriptors) === claim.effect) {
            effectEvidence.push({ requirementId, effect: claim.effect, evidenceRef });
          }
        }
      }
    }
    const facts: ClaimGateFactsV1 = {
      contractVersion: LANDING_PAGE_GOVERNANCE_V1.claimGateFacts,
      effectEvidence,
      capabilityFacts,
      missingUserAuthorizationEvidenceRefs: [],
      transientProviderFailureEvidenceRefs: [],
      policyBlockEvidenceRefs: [],
      goalPathClosureEvidenceRefs: [],
    };
    const assessment = assessTurnOutcomeProposalV1({ goal, proposal, facts });
    if (!assessment.accepted) {
      return {
        accepted: false,
        canonicalOutput: null,
        outcome: proposal.outcome,
        rejectionCodes: assessment.rejectionCodes,
        goal: null,
        proposal: null,
        claimGateAssessmentHash: null,
        evidenceReceiptCallIds: input.receipts.map((receipt) => receipt.callId),
      };
    }
    const referencedCapabilityFactIds = new Set(
      proposal.capabilityGaps.map((gap) => gap.capabilityFactId)
    );
    const hasUnavailableMutation = capabilityReceipts.some((receipt) =>
      referencedCapabilityFactIds.has(`capability-call:${receipt.callId}`)
    );
    const groundedReadAnswer = hasUnavailableMutation
      ? null
      : canonicalH1GroundedReadAnswerV1(
          proposal,
          input.receipts,
          input.terminalReceipt
        );
    const referencesCompletedH1Read = proposal.finalClaims.some((claim) =>
      claim.evidenceRefs.some((evidenceRef) => {
        if (!evidenceRef.startsWith("tool-call:")) return false;
        const callId = evidenceRef.slice("tool-call:".length);
        return input.receipts.some(
          (receipt) =>
            receipt.callId === callId &&
            sameRunAsTerminalV1(receipt, input.terminalReceipt) &&
            receipt.toolId === "canvas_inspect" &&
            receipt.toolVersion === "h1-effective-facts-inspect-v1" &&
            receipt.status === "completed"
        );
      })
    );
    if (
      !hasUnavailableMutation &&
      referencesCompletedH1Read &&
      groundedReadAnswer === null
    ) {
      return {
        accepted: false,
        canonicalOutput: null,
        outcome: proposal.outcome,
        rejectionCodes: ["h1_grounded_read_delivery_invalid"],
        goal: null,
        proposal: null,
        claimGateAssessmentHash: null,
        evidenceReceiptCallIds: [],
      };
    }
    return {
      accepted: true,
      canonicalOutput: hasUnavailableMutation
        ? CANONICAL_CAPABILITY_DEGRADED_DELIVERY_V1
        : groundedReadAnswer ?? CANONICAL_ADVISORY_DELIVERY_V1,
      outcome: proposal.outcome,
      rejectionCodes: [],
      goal,
      proposal,
      claimGateAssessmentHash: hashCanonicalJsonV1(assessment),
      evidenceReceiptCallIds: [
        ...new Set([
          ...effectEvidence.map((evidence) =>
            evidence.evidenceRef.slice("tool-call:".length)
          ),
          ...proposal.capabilityGaps
            .map((gap) =>
              gap.capabilityFactId.startsWith("capability-call:")
                ? gap.capabilityFactId.slice("capability-call:".length)
                : null
            )
            .filter((callId): callId is string => Boolean(callId)),
        ]),
      ],
    };
  } catch {
    return {
      accepted: false,
      canonicalOutput: null,
      outcome: null,
      rejectionCodes: ["terminal_proposal_invalid"],
      goal: null,
      proposal: null,
      claimGateAssessmentHash: null,
      evidenceReceiptCallIds: [],
    };
  }
};
