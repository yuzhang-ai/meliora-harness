import { isIP } from "node:net";

const parseIpv4 = (address: string) => {
  const cells = address.split(".").map(Number);
  return cells.length === 4 &&
    cells.every((cell) => Number.isInteger(cell) && cell >= 0 && cell <= 255)
    ? cells
    : null;
};

const parseIpv6Bytes = (address: string): Uint8Array | null => {
  let normalized = address;
  if (normalized.includes(".")) {
    const separator = normalized.lastIndexOf(":");
    const ipv4 = parseIpv4(normalized.slice(separator + 1));
    if (separator < 0 || !ipv4) return null;
    normalized = `${normalized.slice(0, separator)}:${(
      (ipv4[0] << 8) |
      ipv4[1]
    ).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }
  const compression = normalized.indexOf("::");
  if (compression !== normalized.lastIndexOf("::")) return null;
  const left = (compression < 0 ? normalized : normalized.slice(0, compression))
    .split(":")
    .filter(Boolean);
  const right = (compression < 0 ? "" : normalized.slice(compression + 2))
    .split(":")
    .filter(Boolean);
  const missing = 8 - left.length - right.length;
  if (
    (compression < 0 && missing !== 0) ||
    (compression >= 0 && missing < 1) ||
    [...left, ...right].some((cell) => !/^[a-f0-9]{1,4}$/u.test(cell))
  ) {
    return null;
  }
  const cells = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ].map((cell) => Number.parseInt(cell, 16));
  if (cells.length !== 8) return null;
  const bytes = new Uint8Array(16);
  cells.forEach((cell, index) => {
    bytes[index * 2] = cell >>> 8;
    bytes[index * 2 + 1] = cell & 0xff;
  });
  return bytes;
};

const matchesIpv6Prefix = (
  address: Uint8Array,
  prefix: Uint8Array,
  prefixBits: number
) => {
  const completeBytes = Math.floor(prefixBits / 8);
  for (let index = 0; index < completeBytes; index += 1) {
    if (address[index] !== prefix[index]) return false;
  }
  const remainingBits = prefixBits % 8;
  if (!remainingBits) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return (address[completeBytes] & mask) === (prefix[completeBytes] & mask);
};

const ipv6Prefix = (address: string, prefixBits: number) => {
  const bytes = parseIpv6Bytes(address);
  if (!bytes) throw new Error(`invalid_static_ipv6_prefix:${address}`);
  return { bytes, prefixBits };
};

// These special-purpose ranges are either not globally reachable or can
// encode an IPv4 destination. The broad 2001::/23 and deprecated 6to4 ranges
// intentionally fail closed for a browser egress boundary.
const DENIED_IPV6_PREFIXES = [
  ipv6Prefix("2001::", 23),
  ipv6Prefix("2001:db8::", 32),
  ipv6Prefix("2002::", 16),
  ipv6Prefix("3fff::", 20),
] as const;

const NAT64_WELL_KNOWN_PREFIX = ipv6Prefix("64:ff9b::", 96);

/** The desktop sandbox may resolve every public host into its controlled
 * benchmark-range egress proxy. Callers must additionally prove that global
 * synthetic DNS mode is active before treating one of these addresses as
 * reachable; an IP literal in this range remains denied. */
export const isSyntheticEgressAddress = (address: string) => {
  const cells = parseIpv4(address.trim());
  return Boolean(
    cells && cells[0] === 198 && (cells[1] === 18 || cells[1] === 19)
  );
};

export const isPublicNetworkAddress = (rawAddress: string): boolean => {
  const address = rawAddress
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/gu, "")
    .split("%")[0];
  const family = isIP(address);
  if (family === 4) {
    const cells = parseIpv4(address)!;
    const [a, b, c] = cells;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 0 || b === 168)) return false;
    if (
      a === 192 &&
      ((b === 31 && c === 196) ||
        (b === 52 && c === 193) ||
        (b === 88 && c === 99) ||
        (b === 175 && c === 48))
    ) {
      return false;
    }
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
    if (a === 203 && b === 0) return false;
    return true;
  }
  if (family !== 6) return false;
  const bytes = parseIpv6Bytes(address);
  if (!bytes) return false;

  // RFC 6052's well-known /96 prefix carries the IPv4 address in the final
  // 32 bits. Apply the same public-address policy to the embedded endpoint.
  if (
    matchesIpv6Prefix(
      bytes,
      NAT64_WELL_KNOWN_PREFIX.bytes,
      NAT64_WELL_KNOWN_PREFIX.prefixBits
    )
  ) {
    return isPublicNetworkAddress(
      `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`
    );
  }

  // Public browser egress only admits Global Unicast (2000::/3), then removes
  // IANA special-purpose ranges. This denies mapped/compatible IPv4, ULA,
  // link/site-local, multicast and transition encodings by construction.
  if ((bytes[0] & 0xe0) !== 0x20) return false;
  return !DENIED_IPV6_PREFIXES.some(({ bytes: prefix, prefixBits }) =>
    matchesIpv6Prefix(bytes, prefix, prefixBits)
  );
};
