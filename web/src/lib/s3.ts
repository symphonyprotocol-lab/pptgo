import "server-only"
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing environment variable ${name}`)
  return value
}

let client: S3Client | undefined

/**
 * rustfs speaks S3, so the AWS SDK talks to it unchanged — with two caveats:
 * `forcePathStyle`, because a self-hosted server has no per-bucket subdomain, and an
 * explicit region, because rustfs ignores it but the signer refuses to sign without one.
 */
function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: required("S3_ENDPOINT"),
      region: process.env.S3_REGION || "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: required("S3_ACCESS_KEY_ID"),
        secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
      },
    })
  }
  return client
}

function bucket(): string {
  return required("S3_BUCKET")
}

let bucketReady: Promise<void> | undefined

/**
 * Creates the bucket the first time it is needed, so a fresh `docker compose up` has
 * nothing to provision by hand. Memoised: subsequent calls are a resolved promise.
 */
function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const Bucket = bucket()
    try {
      await s3().send(new HeadBucketCommand({ Bucket }))
    } catch {
      try {
        await s3().send(new CreateBucketCommand({ Bucket }))
      } catch (error) {
        // a racing instance may have won; only a still-missing bucket is fatal
        await s3().send(new HeadBucketCommand({ Bucket })).catch(() => {
          throw error
        })
      }
    }
  })().catch((error) => {
    bucketReady = undefined // let the next request retry instead of caching the failure
    throw error
  })
  return bucketReady
}

export async function putObject(
  key: string,
  body: Uint8Array | string,
  contentType: string,
): Promise<void> {
  await ensureBucket()
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

/** Returns null when the object is absent, rather than throwing. */
export async function getObject(key: string): Promise<Uint8Array | null> {
  await ensureBucket()
  try {
    const result = await s3().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key }),
    )
    if (!result.Body) return null
    return await result.Body.transformToByteArray()
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

export async function deleteObjects(keys: string[]): Promise<void> {
  if (!keys.length) return
  await ensureBucket()
  await s3().send(
    new DeleteObjectsCommand({
      Bucket: bucket(),
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    }),
  )
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const { name, $metadata } = error as {
    name?: string
    $metadata?: { httpStatusCode?: number }
  }
  return name === "NoSuchKey" || name === "NotFound" || $metadata?.httpStatusCode === 404
}
