import {
    AbortMultipartUploadCommand,
    CompleteMultipartUploadCommand,
    CreateMultipartUploadCommand,
    type S3Client,
    UploadPartCommand,
    type UploadPartCommandOutput,
} from '@aws-sdk/client-s3'
import { Buffer } from 'node:buffer'

function formatBytes(bytes: number, decimals = 2): string {
    if (!bytes) {
        return '0 Bytes'
    }

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = [
        'Bytes',
        'KiB',
        'MiB',
        'GiB',
        'TiB',
        'PiB',
        'EiB',
        'ZiB',
        'YiB',
    ]

    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export interface LoggerInterface {
    debug: (message: string, context: Record<string, unknown>) => void
}

export interface S3BatchUploaderOptions<T> {
    checkInterval?: number
    logger?: LoggerInterface
    transformer?: (rows: T[]) => string
}

/**
 * S3 Multipart upload
 *
 * process adapted from https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-upload-object.html
 *
 * **IMPORTANT**. Run this in a try/catch block and call `abort` on any error to tell s3 to throw away the upload
 */
export class S3MultipartUploader<T = string> {
    // 5 MB min batch size for S3 multipart uploads
    public readonly minBatchSize = 1024 * 1024 * 5
    public uploadId: string | undefined
    public data: T[] = []
    public parts: Array<Promise<UploadPartCommandOutput>> = []
    public checkIntervalCounter = 0
    public checkInterval: number
    public readonly logger: LoggerInterface | undefined
    public readonly dataTransformer: (rows: T[]) => string

    constructor(
        private readonly s3: S3Client,
        public readonly bucket: string,
        public readonly key: string,
        {
            checkInterval = 5000,
            logger,
            transformer = (rows) => rows.join(''),
        }: S3BatchUploaderOptions<T> = {},
    ) {
        this.checkInterval = checkInterval
        this.logger = logger
        this.dataTransformer = transformer
    }

    public async start(): Promise<string | undefined> {
        this.log('Starting upload')
        const multipartUpload = await this.s3.send(
            new CreateMultipartUploadCommand({
                Bucket: this.bucket,
                Key: this.key,
            }),
        )
        this.uploadId = multipartUpload.UploadId
        return multipartUpload.UploadId
    }

    public add(data: T): void {
        if (!this.uploadId) {
            throw new Error('Uploader not started, cannot add data')
        }
        this.data.push(data)
        this.checkIntervalCounter++
        if (this.checkIntervalCounter >= this.checkInterval) {
            this.log('Check interval reached: attempting to push')
            this.push()
            this.checkIntervalCounter = 0
        }
    }

    protected push(force = false): void {
        if (!this.uploadId) {
            throw new Error('Uploader not started, cannot push')
        }
        if (this.data.length === 0) {
            this.log('File size limit not met: skipping')
            return
        }
        const transformed = this.dataTransformer(this.data)
        const byteLength = Buffer.byteLength(transformed)
        if (byteLength < this.minBatchSize && !force) {
            return
        }

        this.log('File size limit reached: pushing', {
            size: formatBytes(byteLength),
            part: this.parts.length + 1,
        })
        this.parts.push(
            this.s3.send(
                new UploadPartCommand({
                    Bucket: this.bucket,
                    Key: this.key,
                    UploadId: this.uploadId,
                    Body: transformed,
                    PartNumber: this.parts.length + 1,
                }),
            ),
        )
        // Reset data for next batch
        this.data = []
    }

    public async finish(): Promise<void> {
        if (!this.uploadId) {
            throw new Error('Uploader not started, cannot finish')
        }

        this.log('Finishing: attempting to push')
        this.push(true)

        const parts = await Promise.all(this.parts)

        this.log('Completing upload')
        await this.s3.send(
            new CompleteMultipartUploadCommand({
                Bucket: this.bucket,
                Key: this.key,
                UploadId: this.uploadId,
                MultipartUpload: {
                    Parts: parts.map(({ ETag }, i) => ({
                        ETag,
                        PartNumber: i + 1,
                    })),
                },
            }),
        )
        this.uploadId = undefined
    }

    public async abort(): Promise<void> {
        if (this.uploadId) {
            this.log('Aborting upload')
            await this.s3.send(
                new AbortMultipartUploadCommand({
                    Bucket: this.bucket,
                    Key: this.key,
                    UploadId: this.uploadId,
                }),
            )
            this.uploadId = undefined
        }
    }

    private log(message: string, context?: Record<string, unknown>): void {
        this.logger?.debug(message, {
            bucket: this.bucket,
            key: this.key,
            uploadId: this.uploadId,
            ...context,
        })
    }
}
