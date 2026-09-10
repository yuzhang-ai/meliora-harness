import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import {
  isPublicNetworkAddress,
  isSyntheticEgressAddress,
} from "../../public-network-policy";

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_TEXT_CHARACTERS = 12_000;
const REQUEST_TIMEOUT_MS = 12_000;

export class PublicWebReadErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "PublicWebReadErrorV1";
  }
}

export type PublicWebReadResultV1 = Readonly<{
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  contentHash: string;
  truncated: boolean;
  text: string;
}>;

export interface PublicWebReaderPortV1 {
  read(url: string, abortSignal?: AbortSignal): Promise<PublicWebReadResultV1>;
}

export const isSyntheticEgressAddressV1 = isSyntheticEgressAddress;
export const isPublicNetworkAddressV1 = isPublicNetworkAddress;

export const parsePublicWebUrlV1 = (value: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PublicWebReadErrorV1(
      "public_web_url_invalid",
      "Public Web URL is invalid."
    );
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new PublicWebReadErrorV1(
      "public_web_protocol_denied",
      "Only http and https URLs are allowed."
    );
  if (url.username || url.password)
    throw new PublicWebReadErrorV1(
      "public_web_credentials_denied",
      "Credential-bearing URLs are denied."
    );
  if (!url.hostname || url.hostname.length > 253)
    throw new PublicWebReadErrorV1(
      "public_web_host_invalid",
      "Public Web host is invalid."
    );
  url.hash = "";
  return url;
};

const htmlToText = (input: string) =>
  input
    .replace(
      /<(?:script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|svg)>/giu,
      " "
    )
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article)>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&#(\d+);/gu, (_match, decimal: string) =>
      String.fromCodePoint(Number(decimal))
    )
    .replace(/&#x([0-9a-f]+);/giu, (_match, hexadecimal: string) =>
      String.fromCodePoint(Number.parseInt(hexadecimal, 16))
    )
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/\n\s*\n\s*\n+/gu, "\n\n")
    .trim();

type PinnedResponseV1 = Readonly<{
  status: number;
  location: string | null;
  contentType: string;
  contentEncoding: string;
  body: string;
}>;

export const requestPinnedV1 = (
  url: URL,
  address: string,
  family: 4 | 6,
  abortSignal?: AbortSignal,
  timeoutMs = REQUEST_TIMEOUT_MS
) =>
  new Promise<PinnedResponseV1>((resolve, reject) => {
    let settled = false;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      action();
    };
    const settleReject = (error: unknown) => settle(() => reject(error));
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        protocol: url.protocol,
        hostname: address,
        family,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: url.protocol === "https:" ? url.hostname : undefined,
        headers: {
          Accept: "text/html, application/xhtml+xml, text/plain;q=0.9",
          "Accept-Encoding": "identity",
          Host: url.host,
          "User-Agent": "Zhiqu-Landing-Page-Harness/1.0",
        },
        signal: abortSignal,
      },
      (response) => {
        const chunks: Uint8Array[] = [];
        let byteLength = 0;
        response.on("data", (chunk: Buffer) => {
          byteLength += chunk.byteLength;
          if (byteLength > MAX_RESPONSE_BYTES) {
            response.destroy(
              new PublicWebReadErrorV1(
                "public_web_response_too_large",
                "Public Web response exceeded the byte limit."
              )
            );
            return;
          }
          chunks.push(new Uint8Array(chunk));
        });
        response.on("error", settleReject);
        response.on("end", () =>
          settle(() =>
            resolve({
              status: response.statusCode || 0,
              location:
                typeof response.headers.location === "string"
                  ? response.headers.location
                  : null,
              contentType: String(
                response.headers["content-type"] || ""
              ).toLowerCase(),
              contentEncoding: String(
                response.headers["content-encoding"] || "identity"
              ).toLowerCase(),
              body: Buffer.concat(chunks).toString("utf8"),
            })
          )
        );
      }
    );
    const timeoutError = () =>
      new PublicWebReadErrorV1(
        "public_web_timeout",
        "Public Web request timed out."
      );
    deadline = setTimeout(() => request.destroy(timeoutError()), timeoutMs);
    request.setTimeout(timeoutMs, () => request.destroy(timeoutError()));
    request.on("error", settleReject);
    request.end();
  });

export class NodePublicWebReaderV1 implements PublicWebReaderPortV1 {
  private syntheticDnsMode: Promise<boolean> | null = null;

  constructor(
    private readonly resolveAddresses: (
      hostname: string
    ) => Promise<readonly { address: string; family: number }[]> = (hostname) =>
      lookup(hostname, { all: true, verbatim: true })
  ) {}

  private detectSyntheticDnsMode() {
    if (!this.syntheticDnsMode) {
      this.syntheticDnsMode = Promise.all([
        this.resolveAddresses("example.com"),
        this.resolveAddresses("cloudflare.com"),
      ])
        .then((groups) =>
          groups.every(
            (group) =>
              group.length > 0 &&
              group.every((item) => isSyntheticEgressAddressV1(item.address))
          )
        )
        .catch(() => false);
    }
    return this.syntheticDnsMode;
  }

  async read(
    value: string,
    abortSignal?: AbortSignal
  ): Promise<PublicWebReadResultV1> {
    const requested = parsePublicWebUrlV1(value);
    let current = requested;
    for (
      let redirectCount = 0;
      redirectCount <= MAX_REDIRECTS;
      redirectCount += 1
    ) {
      const host = current.hostname.replace(/^\[|\]$/gu, "");
      const directFamily = isIP(host);
      const resolved = directFamily
        ? [{ address: host, family: directFamily }]
        : await this.resolveAddresses(host);
      const syntheticEgress =
        directFamily === 0 &&
        resolved.length > 0 &&
        resolved.every((item) => isSyntheticEgressAddressV1(item.address)) &&
        (await this.detectSyntheticDnsMode());
      if (
        !resolved.length ||
        (!syntheticEgress &&
          resolved.some((item) => !isPublicNetworkAddressV1(item.address)))
      ) {
        throw new PublicWebReadErrorV1(
          "public_web_address_denied",
          "Public Web host resolved to a denied network address."
        );
      }
      const selected = resolved[0];
      if (selected.family !== 4 && selected.family !== 6)
        throw new PublicWebReadErrorV1(
          "public_web_address_invalid",
          "Public Web address family is invalid."
        );
      const response = await requestPinnedV1(
        current,
        selected.address,
        selected.family,
        abortSignal
      );
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.location
      ) {
        if (redirectCount === MAX_REDIRECTS)
          throw new PublicWebReadErrorV1(
            "public_web_redirect_limit",
            "Public Web redirect limit was exceeded."
          );
        const next = parsePublicWebUrlV1(
          new URL(response.location, current).toString()
        );
        if (current.protocol === "https:" && next.protocol !== "https:")
          throw new PublicWebReadErrorV1(
            "public_web_redirect_downgrade",
            "HTTPS redirect downgrade is denied."
          );
        current = next;
        continue;
      }
      if (response.status < 200 || response.status >= 300)
        throw new PublicWebReadErrorV1(
          "public_web_http_error",
          `Public Web returned HTTP ${response.status}.`
        );
      if (response.contentEncoding && response.contentEncoding !== "identity")
        throw new PublicWebReadErrorV1(
          "public_web_encoding_denied",
          "Compressed Public Web responses are not accepted."
        );
      const textContent =
        /^(?:text\/html|application\/xhtml\+xml|text\/plain)(?:;|$)/u.test(
          response.contentType
        );
      if (!textContent)
        throw new PublicWebReadErrorV1(
          "public_web_content_type_denied",
          "Public Web content type is not readable text."
        );
      const decoded = response.body;
      const text = response.contentType.startsWith("text/plain")
        ? decoded.trim()
        : htmlToText(decoded);
      if (!text)
        throw new PublicWebReadErrorV1(
          "public_web_empty",
          "Public Web response did not contain readable text."
        );
      return {
        requestedUrl: requested.toString(),
        finalUrl: current.toString(),
        status: response.status,
        contentType: response.contentType,
        contentHash: createHash("sha256").update(text, "utf8").digest("hex"),
        truncated: text.length > MAX_TEXT_CHARACTERS,
        text: text.slice(0, MAX_TEXT_CHARACTERS),
      };
    }
    throw new PublicWebReadErrorV1(
      "public_web_redirect_limit",
      "Public Web redirect limit was exceeded."
    );
  }
}
