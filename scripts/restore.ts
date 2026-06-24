import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import * as tar from "tar";
import { config, paths } from "../server/config.js";

if (process.env.CONFIRM_RESTORE !== "YES") throw new Error("Set CONFIRM_RESTORE=YES to confirm that the current data may be replaced");
const file = process.env.RESTORE_FILE;
const secret = process.env.BACKUP_ENCRYPTION_KEY;
if (!file || !secret) throw new Error("RESTORE_FILE and BACKUP_ENCRYPTION_KEY are required");

const absolute = path.resolve(file);
const input = await fs.promises.readFile(absolute);
if (input.length < 7 + 12 + 16 || input.subarray(0, 7).toString() !== "DTUBKP1") throw new Error("Not a valid DTU backup");

const iv = input.subarray(7, 19);
const tag = input.subarray(input.length - 16);
const ciphertext = input.subarray(19, input.length - 16);
const key = crypto.createHash("sha256").update(secret).digest();
const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(tag);

fs.mkdirSync(paths.backups, { recursive: true });
const tempArchive = path.join(paths.backups, `.restore-${Date.now()}.tar.gz`);
const tempEncrypted = path.join(paths.backups, `.restore-${Date.now()}.cipher`);
await fs.promises.writeFile(tempEncrypted, ciphertext);
try {
  await pipeline(fs.createReadStream(tempEncrypted), decipher, fs.createWriteStream(tempArchive));
  const safetyCopy = `${paths.database}.before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  if (fs.existsSync(paths.database)) await fs.promises.copyFile(paths.database, safetyCopy);
  await tar.x({ file: tempArchive, cwd: config.dataDir, preservePaths: false });
  const snapshot = path.join(config.dataDir, ".backup-snapshot.sqlite");
  if (!fs.existsSync(snapshot)) throw new Error("Backup does not contain a database snapshot");
  await fs.promises.rename(snapshot, paths.database);
  console.log(`Restore completed. Previous database safety copy: ${safetyCopy}`);
} finally {
  await fs.promises.rm(tempArchive, { force: true });
  await fs.promises.rm(tempEncrypted, { force: true });
}
