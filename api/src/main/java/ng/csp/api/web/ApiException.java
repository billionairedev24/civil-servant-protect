package ng.csp.api.web;

import org.springframework.http.HttpStatus;

/**
 * An error with a status, a stable machine code and a message meant for a person.
 *
 * <p>The message is part of the product. "Forbidden" sends an HR officer to the helpdesk; "a
 * preparer cannot close a cycle — ask an approver" sends them to the colleague who can actually do
 * it.
 */
public class ApiException extends RuntimeException {

  private final HttpStatus status;
  private final String code;

  public ApiException(HttpStatus status, String code, String message) {
    super(message);
    this.status = status;
    this.code = code;
  }

  public HttpStatus status() {
    return status;
  }

  public String code() {
    return code;
  }

  public static ApiException unauthorized(String message) {
    return new ApiException(HttpStatus.UNAUTHORIZED, "unauthorized", message);
  }

  public static ApiException forbidden(String message) {
    return new ApiException(HttpStatus.FORBIDDEN, "forbidden", message);
  }

  public static ApiException notFound(String message) {
    return new ApiException(HttpStatus.NOT_FOUND, "not_found", message);
  }

  public static ApiException badRequest(String message) {
    return new ApiException(HttpStatus.BAD_REQUEST, "bad_request", message);
  }

  /** A well-formed request that a rule refused. */
  public static ApiException conflict(String code, String message) {
    return new ApiException(HttpStatus.CONFLICT, code, message);
  }

  /**
   * Something we depend on is not answering.
   *
   * <p>503 rather than 500, because the difference matters to whoever is looking at it: a 500 means
   * this service is broken and somebody should be paged, a 503 means NIMC is down and the answer is
   * to wait. A client may also retry a 503 and should not retry a 500.
   */
  public static ApiException serviceUnavailable(String message) {
    return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "upstream_unavailable", message);
  }

  public static ApiException tooManyRequests(String message) {
    return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "locked", message);
  }
}
