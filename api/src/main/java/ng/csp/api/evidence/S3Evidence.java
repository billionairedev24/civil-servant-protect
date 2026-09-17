package ng.csp.api.evidence;

import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.Map;
import ng.csp.api.web.ApiException;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.ServerSideEncryption;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

/**
 * Claim evidence in S3-compatible object storage.
 *
 * <p>S3-compatible rather than a vendor SDK, because the spec's whole hosting argument is that this
 * runs on MinIO in Abuja, on Ceph, or on a provider's own store without a rewrite. Sovereignty means
 * being able to move, and code written against one vendor's API cannot.
 *
 * <p>The browser uploads straight to the bucket with a presigned PUT; the bytes never pass through
 * this service. Ten megabytes through a request thread is a thread spent copying, and on roll week
 * those threads are wanted elsewhere.
 */
public class S3Evidence implements Evidence {

  /** Long enough for a certificate over a bad connection, short enough to be worth signing. */
  private static final Duration WINDOW = Duration.ofMinutes(15);

  private final S3Client s3;
  private final S3Presigner presigner;
  private final String bucket;
  private final String where;

  public S3Evidence(String endpoint, String region, String bucket, String accessKey, String secretKey) {
    this.bucket = bucket;
    this.where = (endpoint == null || endpoint.isBlank() ? "AWS " + region : endpoint) + "/" + bucket;

    var credentials =
        StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey));
    /*
     * Path-style addressing, because the alternative is DNS.
     *
     * Virtual-host style puts the bucket in the hostname, which works for AWS
     * and not for a MinIO on an internal address with no wildcard certificate —
     * the arrangement this will actually be deployed onto.
     */
    var config = S3Configuration.builder().pathStyleAccessEnabled(true).build();

    var client = S3Client.builder().region(Region.of(region)).credentialsProvider(credentials).serviceConfiguration(config);
    var signer = S3Presigner.builder().region(Region.of(region)).credentialsProvider(credentials).serviceConfiguration(config);
    if (endpoint != null && !endpoint.isBlank()) {
      client.endpointOverride(URI.create(endpoint));
      signer.endpointOverride(URI.create(endpoint));
    }
    this.s3 = client.build();
    this.presigner = signer.build();
  }

  @Override
  public Upload begin(String key, String contentType, long byteSize) {
    var put =
        PutObjectRequest.builder()
            .bucket(bucket)
            .key(key)
            .contentType(contentType)
            .contentLength(byteSize)
            /*
             * Encrypted by the bucket's own key management, because the file is
             * a death certificate. SSE-S3 rather than a key passed in the
             * request: a key in a presigned URL is a key in a browser history.
             */
            .serverSideEncryption(ServerSideEncryption.AES256)
            .build();

    var signed =
        presigner.presignPutObject(
            PutObjectPresignRequest.builder().signatureDuration(WINDOW).putObjectRequest(put).build());

    /*
     * The headers are part of the signature, so the client has to send exactly
     * these and no others. Handing them back rather than documenting them is
     * the difference between a client that works and one that gets a 403 it
     * cannot explain.
     */
    var headers = new java.util.LinkedHashMap<String, String>();
    headers.put("Content-Type", contentType);
    headers.put("x-amz-server-side-encryption", ServerSideEncryption.AES256.toString());

    return new Upload(key, signed.url().toString(), "PUT", Map.copyOf(headers), signed.expiration());
  }

  @Override
  public InputStream read(String key) {
    try {
      return s3.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build());
    } catch (NoSuchKeyException e) {
      throw ApiException.notFound("That document has not been uploaded.");
    }
  }

  @Override
  public boolean exists(String key) {
    try {
      s3.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());
      return true;
    } catch (NoSuchKeyException e) {
      return false;
    }
  }

  @Override
  public String describe() {
    return "s3 " + where;
  }
}
