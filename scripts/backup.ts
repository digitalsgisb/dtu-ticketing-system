import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import Database from "better-sqlite3";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import * as tar from "tar";
import { config, paths } from "../server/config.js";
import { malaysiaDate } from "../server/time.js";

const secret = process.env.BACKUP_ENCRYPTION_KEY;
if (!secret || secret.length < 20) throw new Error("BACKUP_ENCRYPTION_KEY must be set to a long, private passphrase");

fs.mkdirSync(paths.backups, { recursive: true });
const date = malaysiaDate();
const snapshot = path.join(config.dataDir, ".backup-snapshot.sqlite");
const archive = path.join(paths.backups, `dtu-${date}.tar.gz`);
const encrypted = `${archive}.enc`;

const source = new Database(paths.database, { readonly: true });
try {
  await source.backup(snapshot);
} finally {
  source.close();
}

try {
  const entries = [path.basename(snapshot)];
  if (fs.existsSync(paths.uploads)) entries.push(path.basename(paths.uploads));
  await tar.c({ gzip: true, file: archive, cwd: config.dataDir }, entries);

  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  await fs.promises.writeFile(encrypted, Buffer.concat([Buffer.from("DTUBKP1"), iv]));
  await pipeline(fs.createReadStream(archive), cipher, fs.createWriteStream(encrypted, { flags: "a" }));
  await fs.promises.appendFile(encrypted, cipher.getAuthTag());

  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET;
  if (endpoint && bucket && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      }
    });
    const dailyKey = `daily/dtu-${date}.tar.gz.enc`;
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: dailyKey,
      Body: fs.createReadStream(encrypted),
      ContentType: "application/octet-stream",
      Metadata: { encryption: "AES-256-GCM", format: "DTUBKP1" }
    }));
    if (date.endsWith("-01")) {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `monthly/dtu-${date.slice(0, 7)}.tar.gz.enc`,
        Body: fs.createReadStream(encrypted),
        ContentType: "application/octet-stream",
        Metadata: { encryption: "AES-256-GCM", format: "DTUBKP1" }
      }));
    }
    await prune(client, bucket, "daily/", 30);
    await prune(client, bucket, "monthly/", 12);
  } else {
    console.warn("R2 is not configured; backup was retained locally only.");
  }

  const local = (await fs.promises.readdir(paths.backups))
    .filter(name => name.endsWith(".enc"))
    .sort()
    .reverse();
  await Promise.all(local.slice(7).map(name => fs.promises.rm(path.join(paths.backups, name), { force: true })));
  console.log(`Encrypted backup completed: ${encrypted}`);
} finally {
  await fs.promises.rm(snapshot, { force: true });
  await fs.promises.rm(archive, { force: true });
}

async function prune(client: S3Client, bucket: string, prefix: string, retain: number) {
  const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  const objects = (listed.Contents ?? []).filter(item => item.Key).sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));
  const expired = objects.slice(retain).map(item => ({ Key: item.Key! }));
  if (expired.length) await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: expired, Quiet: true } }));
}
