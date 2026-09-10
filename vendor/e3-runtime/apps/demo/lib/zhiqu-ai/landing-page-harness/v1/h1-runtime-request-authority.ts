import { randomUUID } from "node:crypto";
import type {
  EffectiveFactsAuthenticatedPrincipalV1,
  EffectiveFactsDocumentAclDecisionV1,
  EffectiveFactsDocumentAclPortV1,
} from "../../editor-canvas/v1/effective-facts-capture-grant";
import {
  EFFECTIVE_FACTS_CAPTURE_TARGETS_V1,
} from "../../editor-canvas/v1/effective-facts-capture-grant";
import {
  hashCanonicalJsonV1,
  requiredIdV1,
  requiredRuntimeMountIdV1,
  requiredTimestampV1,
} from "./strict-json";

export type H1RuntimeApiActionV1 =
  | "capture-grant.issue"
  | "b2.evidence.read"
  | "turn.create"
  | "turn.reconcile"
  | "run.read"
  | "run.events.read"
  | "run.stop"
  | "run.resume"
  | "thread.list"
  | "thread.read"
  | "thread.rename";

export interface H1RuntimeRequestAuthorityPortV1 {
  authenticate(
    request: Request,
    action: H1RuntimeApiActionV1
  ): Promise<EffectiveFactsAuthenticatedPrincipalV1>;
}

export type H1LocalAclCommitBindingV1 = Readonly<{
  authorizationInput: Parameters<
    EffectiveFactsDocumentAclPortV1["authorize"]
  >[0];
  expectedDecisionHash: string;
}>;

export interface H1LocalAuthorityCommitIssuerV1 {
  issueLocalAuthorityCommitAssertion(input: Readonly<{
    bindings: readonly H1LocalAclCommitBindingV1[];
  }>): Readonly<{
    localAuthorityInstanceId: string;
    localAuthorityEpoch: number;
    assertLocalAuthorityCurrent(): void;
  }>;
}

export class H1RuntimeRequestAuthorityErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "H1RuntimeRequestAuthorityErrorV1";
  }
}

export class DenyAllH1RuntimeRequestAuthorityV1
  implements H1RuntimeRequestAuthorityPortV1
{
  async authenticate(): Promise<EffectiveFactsAuthenticatedPrincipalV1> {
    throw new H1RuntimeRequestAuthorityErrorV1(
      "h1_request_authority_unavailable",
      "H1 request authentication is not installed in this environment."
    );
  }
}

/**
 * Local-isolated B1/B2 authority. It accepts only the exact loopback
 * action/method matrix and returns a constructor-owned principal; no body,
 * query, cookie, or header can override identity. Production authentication is
 * deliberately not claimed.
 */
export class LocalIsolatedH1RuntimeRequestAuthorityV1
  implements H1RuntimeRequestAuthorityPortV1
{
  private readonly principal: EffectiveFactsAuthenticatedPrincipalV1;

  constructor(principal: EffectiveFactsAuthenticatedPrincipalV1) {
    this.principal = {
      subjectId: requiredIdV1(principal.subjectId, "h1Principal.subjectId"),
      tenantId: requiredIdV1(principal.tenantId, "h1Principal.tenantId"),
      sessionBindingId: requiredIdV1(
        principal.sessionBindingId,
        "h1Principal.sessionBindingId"
      ),
      authenticationMethod: requiredIdV1(
        principal.authenticationMethod,
        "h1Principal.authenticationMethod"
      ),
      authenticatedAt: requiredTimestampV1(
        principal.authenticatedAt,
        "h1Principal.authenticatedAt"
      ),
    };
  }

  async authenticate(
    request: Request,
    action: H1RuntimeApiActionV1
  ): Promise<EffectiveFactsAuthenticatedPrincipalV1> {
    const url = new URL(request.url);
    const expectedMethod: Readonly<Record<H1RuntimeApiActionV1, string>> = {
      "capture-grant.issue": "POST",
      "b2.evidence.read": "GET",
      "turn.create": "POST",
      "turn.reconcile": "POST",
      "run.read": "GET",
      "run.events.read": "GET",
      "run.stop": "POST",
      "run.resume": "POST",
      "thread.list": "GET",
      "thread.read": "GET",
      "thread.rename": "PATCH",
    };
    if (
      request.method !== expectedMethod[action] ||
      !["127.0.0.1", "localhost", "::1"].includes(url.hostname)
    ) {
      throw new H1RuntimeRequestAuthorityErrorV1(
        "h1_request_authority_denied",
        "Local H1 authority rejected the route action, method, or host."
      );
    }
    return structuredClone(this.principal);
  }
}

export type LocalAclTupleV1 = Readonly<{
  tenantId: string;
  subjectId: string;
  workspaceId: string;
  sessionId: string;
  sessionBindingId: string;
  documentId: keyof typeof EFFECTIVE_FACTS_CAPTURE_TARGETS_V1;
  mountId: string;
}>;

/** Exact allow-list ACL for the isolated candidate. Revoking or changing the
 * policy revision immediately makes every later Grant commit/read fail. */
export class LocalIsolatedH1DocumentAclV1
  implements EffectiveFactsDocumentAclPortV1, H1LocalAuthorityCommitIssuerV1
{
  private readonly tuples = new Map<string, LocalAclTupleV1>();
  private revision = 1;
  private authorityEpoch = 1;
  private readonly authorityInstanceId = `h1-local-acl-${randomUUID()}`;

  constructor(tuples: readonly LocalAclTupleV1[]) {
    for (const tuple of tuples) {
      const normalized = this.normalizeTuple(tuple);
      this.tuples.set(hashCanonicalJsonV1(normalized), normalized);
    }
  }

  /** B2-only local browser bridge registration. The caller must already have
   * authenticated the loopback capture-grant route and must provide the
   * server-owned principal/scope constants. Adding a tuple does not revoke
   * existing exact tuples; revocation remains an explicit authority change. */
  admitLocalBrowserTupleV1(tuple: LocalAclTupleV1) {
    const normalized = this.normalizeTuple(tuple);
    const key = hashCanonicalJsonV1(normalized);
    if (!this.tuples.has(key) && this.tuples.size >= 16) {
      throw new H1RuntimeRequestAuthorityErrorV1(
        "h1_local_browser_mount_capacity_exceeded",
        "Local browser H1 mount admission reached its exact tuple limit."
      );
    }
    this.tuples.set(key, normalized);
    return structuredClone(normalized);
  }

  private normalizeTuple(tuple: LocalAclTupleV1): LocalAclTupleV1 {
    if (!Object.hasOwn(EFFECTIVE_FACTS_CAPTURE_TARGETS_V1, tuple.documentId)) {
      throw new H1RuntimeRequestAuthorityErrorV1(
        "h1_acl_target_invalid",
        "ACL tuple document is outside the exact H1 target set."
      );
    }
    return {
      tenantId: requiredIdV1(tuple.tenantId, "h1Acl.tenantId"),
      subjectId: requiredIdV1(tuple.subjectId, "h1Acl.subjectId"),
      workspaceId: requiredIdV1(tuple.workspaceId, "h1Acl.workspaceId"),
      sessionId: requiredIdV1(tuple.sessionId, "h1Acl.sessionId"),
      sessionBindingId: requiredIdV1(
        tuple.sessionBindingId,
        "h1Acl.sessionBindingId"
      ),
      documentId: tuple.documentId,
      mountId: requiredRuntimeMountIdV1(tuple.mountId, "h1Acl.mountId"),
    };
  }

  setRevisionForTest(revision: number) {
    if (!Number.isInteger(revision) || revision < 1) {
      throw new H1RuntimeRequestAuthorityErrorV1(
        "h1_acl_revision_invalid",
        "ACL revision must be a positive integer."
      );
    }
    this.revision = revision;
    this.authorityEpoch += 1;
  }

  revokeForTest(tuple: LocalAclTupleV1) {
    this.tuples.delete(hashCanonicalJsonV1(this.normalizeTuple(tuple)));
    this.revision += 1;
    this.authorityEpoch += 1;
  }

  private evaluate(
    input: Parameters<EffectiveFactsDocumentAclPortV1["authorize"]>[0]
  ): EffectiveFactsDocumentAclDecisionV1 {
    const tuple: LocalAclTupleV1 = {
      tenantId: input.tenantId,
      subjectId: input.principal.subjectId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      sessionBindingId: input.sessionBindingId,
      documentId: input.documentId,
      mountId: input.mountId,
    };
    const target = EFFECTIVE_FACTS_CAPTURE_TARGETS_V1[input.documentId];
    if (
      !this.tuples.has(hashCanonicalJsonV1(tuple)) ||
      input.principal.tenantId !== input.tenantId ||
      input.principal.sessionBindingId !== input.sessionBindingId ||
      target.routePath !== input.routePath ||
      target.captureProfile !== input.captureProfile
    ) {
      return { allowed: false, reasonCode: "h1_exact_acl_denied" };
    }
    const policyRevision = `local-isolated-r${this.revision}`;
    return {
      allowed: true,
      policyId: "h1-local-isolated-exact-acl",
      policyRevision,
      authorizationDecisionId: `acl-${hashCanonicalJsonV1({
        tuple,
        policyRevision,
      }).slice(0, 24)}`,
    };
  }

  async authorize(
    input: Parameters<EffectiveFactsDocumentAclPortV1["authorize"]>[0]
  ): Promise<EffectiveFactsDocumentAclDecisionV1> {
    return this.evaluate(input);
  }

  issueLocalAuthorityCommitAssertion(input: Readonly<{
    bindings: readonly H1LocalAclCommitBindingV1[];
  }>) {
    if (!input.bindings.length) {
      throw new H1RuntimeRequestAuthorityErrorV1(
        "h1_local_commit_binding_invalid",
        "Local H1 commit authority requires at least one exact ACL binding."
      );
    }
    const epoch = this.authorityEpoch;
    const bindings = structuredClone(input.bindings);
    const assertLocalAuthorityCurrent = () => {
      if (this.authorityEpoch !== epoch) {
        throw new H1RuntimeRequestAuthorityErrorV1(
          "h1_local_commit_authority_stale",
          "Local H1 authority changed before the Store commit."
        );
      }
      for (const binding of bindings) {
        const current = this.evaluate(binding.authorizationInput);
        if (
          !current.allowed ||
          hashCanonicalJsonV1(current) !== binding.expectedDecisionHash
        ) {
          throw new H1RuntimeRequestAuthorityErrorV1(
            "h1_local_commit_authority_stale",
            "Local H1 ACL binding changed before the Store commit."
          );
        }
      }
    };
    assertLocalAuthorityCurrent();
    return {
      localAuthorityInstanceId: this.authorityInstanceId,
      localAuthorityEpoch: epoch,
      assertLocalAuthorityCurrent,
    } as const;
  }
}
