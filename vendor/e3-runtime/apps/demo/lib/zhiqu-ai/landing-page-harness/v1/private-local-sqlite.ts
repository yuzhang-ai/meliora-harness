import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
} from "node:fs";
import path from "node:path";

export class PrivateLocalSqlitePathErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "PrivateLocalSqlitePathErrorV1";
  }
}

// Node exposes POSIX-shaped mode bits on Windows, but chmod cannot establish
// the Unix 0700/0600 guarantee there. Keep the structural checks in this
// migration seam; the Meliora Windows host adapter must enforce ACL ownership.
const canVerifyPosixPermissionsV1 = process.platform !== "win32";

const assertPrivateRegularFileV1 = (filePath: string) => {
  const stat = lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new PrivateLocalSqlitePathErrorV1(
      "local_sqlite_file_invalid",
      "Local SQLite authority files must be regular files."
    );
  }
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    throw new PrivateLocalSqlitePathErrorV1(
      "local_sqlite_file_owner_invalid",
      "Local SQLite authority files must belong to the current user."
    );
  }
  chmodSync(filePath, 0o600);
  if (
    canVerifyPosixPermissionsV1 &&
    (lstatSync(filePath).mode & 0o077) !== 0
  ) {
    throw new PrivateLocalSqlitePathErrorV1(
      "local_sqlite_file_permissions_invalid",
      "Local SQLite authority files must be private to the current user."
    );
  }
};

/** Establishes the filesystem boundary before SQLite can create or mutate the
 * database. The immediate sidecar directory must be real and private; a
 * symlinked immediate directory is rejected before SQLite opens the file. */
export const assertPrivateLocalSqlitePathV1 = (databasePath: string) => {
  const resolved = path.resolve(databasePath);
  const directory = path.dirname(resolved);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  const directoryStat = lstatSync(directory);
  if (
    directoryStat.isSymbolicLink() ||
    !directoryStat.isDirectory()
  ) {
    throw new PrivateLocalSqlitePathErrorV1(
      "local_sqlite_directory_invalid",
      "Local SQLite authority directory must be a real contained directory."
    );
  }
  if (
    canVerifyPosixPermissionsV1 &&
    (directoryStat.mode & 0o077) !== 0
  ) {
    throw new PrivateLocalSqlitePathErrorV1(
      "local_sqlite_directory_permissions_invalid",
      "Local SQLite authority directory must be private to the current user."
    );
  }
  if (
    typeof process.getuid === "function" &&
    directoryStat.uid !== process.getuid()
  ) {
    throw new PrivateLocalSqlitePathErrorV1(
      "local_sqlite_directory_owner_invalid",
      "Local SQLite authority directories must belong to the current user."
    );
  }
  if (existsSync(resolved)) assertPrivateRegularFileV1(resolved);
  return resolved;
};

export const enforcePrivateLocalSqliteFilesV1 = (databasePath: string) => {
  for (const candidate of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (existsSync(candidate)) assertPrivateRegularFileV1(candidate);
  }
};

/** Verifier-only path check. Unlike the writer helper above, this never
 * creates a directory or changes file metadata. */
export const assertExistingPrivateLocalSqlitePathV1 = (
  databasePath: string
) => {
  if (
    !path.isAbsolute(databasePath) ||
    path.normalize(databasePath) !== databasePath ||
    !existsSync(databasePath)
  ) {
    throw new PrivateLocalSqlitePathErrorV1(
      "local_sqlite_readonly_path_invalid",
      "Read-only SQLite authority path must already exist and be canonical."
    );
  }
  const directory = path.dirname(databasePath);
  const directoryStat = lstatSync(directory);
  const fileStat = lstatSync(databasePath);
  if (
    directoryStat.isSymbolicLink() ||
    !directoryStat.isDirectory() ||
    (canVerifyPosixPermissionsV1 &&
      (directoryStat.mode & 0o077) !== 0) ||
    fileStat.isSymbolicLink() ||
    !fileStat.isFile() ||
    (canVerifyPosixPermissionsV1 && (fileStat.mode & 0o077) !== 0)
  ) {
    throw new PrivateLocalSqlitePathErrorV1(
      "local_sqlite_readonly_file_invalid",
      "Read-only SQLite authority must be an existing private regular file."
    );
  }
  if (
    typeof process.getuid === "function" &&
    (directoryStat.uid !== process.getuid() || fileStat.uid !== process.getuid())
  ) {
    throw new PrivateLocalSqlitePathErrorV1(
      "local_sqlite_readonly_owner_invalid",
      "Read-only SQLite authority must belong to the current user."
    );
  }
  const realDirectory = realpathSync(directory);
  const realFile = realpathSync(databasePath);
  if (realFile !== path.join(realDirectory, path.basename(databasePath))) {
    throw new PrivateLocalSqlitePathErrorV1(
      "local_sqlite_readonly_identity_invalid",
      "Read-only SQLite authority path identity is invalid."
    );
  }
  return realFile;
};
