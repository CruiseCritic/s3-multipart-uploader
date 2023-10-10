# S3 Multipart Uploader

Wrapper around AWS SDKs v3 S3 multipart uploader. This tries to simplify the process. It doesn't allow for much
customization but should "just work."

Process adapted from https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-upload-object.html

## Example

```typescript
const s3Uploader = new S3MultipartUploader<CsvRow>(s3Client, bucket, filename, {
    transformer: stringify, // Transformer to transform data into a string needed for file
    checkInterval: 10000, // How many rows should be processed before we check calculated file size.
    logger, // If you pass a logger instance this job will add debug logging for what it's doing
});

// We want to catch any error so that we can abort the upload
try {
    // Start the upload process
    await s3Uploader.start();

    // Optional: Add header row
    s3Uploader.add({
        field1: field1,
        field2: field2,
        ...
    });

    let result;
    do {
        result = // get results
        result.forEach(({ field1, field2 }) => {
            // Add each row of the result
            s3Uploader.add({
                field1,
                field2,
                ...
            });
        });
    } while (result.length);

    // Finish processing data. This will wait for all uploads to finish and tell s3 the upload is finished
    await s3Uploader.finish();
} catch (e) {
    if (e instanceof Error) {
        logger.error('Error uploading', e);
    }
    // Tell s3 to abort the upload 
    await s3Uploader.abort();
}

```
