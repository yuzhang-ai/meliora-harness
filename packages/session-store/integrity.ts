/**
 * Public, adapter-independent canonicalization and hashing primitives.
 *
 * Runtime consumers must import this entrypoint instead of reaching into the
 * SQLite/Memory implementation directory.
 */
export { canonicalJson, hashBytes, hashJson } from "./src/integrity";
