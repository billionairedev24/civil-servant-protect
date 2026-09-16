package ng.csp.api.web;

import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

  public record ErrorBody(String error, String message, List<FieldIssue> issues) {}

  public record FieldIssue(String path, String message) {}

  @ExceptionHandler(ApiException.class)
  ResponseEntity<ErrorBody> handle(ApiException ex) {
    return ResponseEntity.status(ex.status()).body(new ErrorBody(ex.code(), ex.getMessage(), null));
  }

  /** Bean-validation failures. The first message leads, because a form shows one thing at a time. */
  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<ErrorBody> handle(MethodArgumentNotValidException ex) {
    var issues =
        ex.getBindingResult().getFieldErrors().stream()
            .map(e -> new FieldIssue(e.getField(), e.getDefaultMessage()))
            .toList();
    var first = issues.isEmpty() ? "That request was not valid." : issues.getFirst().message();
    return ResponseEntity.badRequest().body(new ErrorBody("bad_request", first, issues));
  }

  @ExceptionHandler(AccessDeniedException.class)
  ResponseEntity<ErrorBody> handle(AccessDeniedException ex) {
    return ResponseEntity.status(HttpStatus.FORBIDDEN)
        .body(new ErrorBody("forbidden", "Your role does not allow that.", null));
  }

  /**
   * Postgres raised one of our own guards — the append-only trigger, or the share-sum check.
   *
   * <p>409 is the honest answer: the request was well-formed and a rule said no. The database
   * message is passed through because those guards are written to be read by a person.
   */
  @ExceptionHandler(DataIntegrityViolationException.class)
  ResponseEntity<ErrorBody> handle(DataIntegrityViolationException ex) {
    var root = ex.getMostSpecificCause().getMessage();
    var sqlState = sqlStateOf(ex);
    if (RULE_STATES.contains(sqlState)) {
      return ResponseEntity.status(HttpStatus.CONFLICT)
          .body(new ErrorBody("rule_violation", clean(root), null));
    }
    log.warn("data integrity violation", ex);
    return ResponseEntity.status(HttpStatus.CONFLICT)
        .body(new ErrorBody("conflict", clean(root), null));
  }

  /** check_violation, restrict_violation, and our raised exceptions. */
  private static final List<String> RULE_STATES = List.of("23514", "23001", "P0001");

  private static String sqlStateOf(Throwable ex) {
    for (Throwable t = ex; t != null; t = t.getCause()) {
      if (t instanceof java.sql.SQLException sql) {
        return sql.getSQLState();
      }
    }
    return "";
  }

  /** Strip the trailing Postgres context lines; the first line is the message we wrote. */
  private static String clean(String message) {
    if (message == null) {
      return "That was refused by a database rule.";
    }
    var newline = message.indexOf('\n');
    return newline > 0 ? message.substring(0, newline) : message;
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<Map<String, String>> handle(Exception ex) {
    log.error("unhandled", ex);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(Map.of("error", "internal", "message", "Something went wrong on our side."));
  }
}
