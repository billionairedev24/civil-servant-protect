package ng.csp.api.claim;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import ng.csp.api.auth.Role;
import ng.csp.api.auth.SessionUser;
import ng.csp.api.domain.Claims;
import ng.csp.api.integration.Payout;
import ng.csp.api.integration.ReplayLog;
import ng.csp.api.web.ApiException;
import ng.csp.api.web.Rows;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class ClaimService {

  private final JdbcClient db;
  private final ObjectMapper json;
  private final Payout payout;

  public ClaimService(JdbcClient db, ObjectMapper json, Payout payout) {
    this.db = db;
    this.json = json;
    this.payout = payout;
  }

  public record Opened(String claimRef, List<String> requiredDocs, String funeralAdvanceRef) {}

  /**
   * Open a claim.
   *
   * <p>A next of kin can do this — which is the point, because the person the cover is about may
   * have died. What they cannot do is change who gets paid, and that separation lives in the role
   * rather than in this method.
   */
  @Transactional
  public Opened open(SessionUser session, String type, String claimantRelation, Object answers) {
    var memberId = session.memberId();
    if (memberId == null) {
      throw ApiException.forbidden("A claim is opened against a member record.");
    }

    var ref = nextRef();
    var claimId =
        db.sql(
                """
                INSERT INTO claims
                  (claim_ref, member_id, type, state, claimant_relation, claimant_user_id, answers)
                VALUES (:ref, :m, CAST(:t AS claim_type), 'documents_pending', :rel, :u, CAST(:a AS jsonb))
                RETURNING id
                """)
            .param("ref", ref)
            .param("m", memberId)
            .param("t", type)
            .param("rel", claimantRelation)
            .param("u", session.userId())
            .param("a", json.writeValueAsString(answers))
            .query(UUID.class)
            .single();

    stage(claimId, "submitted", "done", session.userId().toString(), "Opened on the member app");
    requireDocs(claimId, Claims.requiredDocs(type));

    // A death claim opens a funeral advance beside it automatically. Nobody
    // should have to know to ask for money for a burial happening this week.
    String advanceRef = null;
    if ("death".equals(type)) {
      advanceRef = nextRef();
      var advanceId =
          db.sql(
                  """
                  INSERT INTO claims
                    (claim_ref, member_id, type, state, claimant_relation, claimant_user_id, parent_claim_id)
                  VALUES (:ref, :m, 'funeral_advance', 'documents_pending', :rel, :u, :parent)
                  RETURNING id
                  """)
              .param("ref", advanceRef)
              .param("m", memberId)
              .param("rel", claimantRelation)
              .param("u", session.userId())
              .param("parent", claimId)
              .query(UUID.class)
              .single();
      stage(advanceId, "submitted", "done", session.userId().toString(),
          "Opened automatically beside the death claim");
      requireDocs(advanceId, Claims.requiredDocs("funeral_advance"));
    }

    return new Opened(ref, Claims.requiredDocs(type), advanceRef);
  }

  public record Stage(String key, String state, Instant at, String actor, String note) {}

  public record Document(String key, String state, String filename, Instant uploadedAt) {}

  public record Assessor(String name, String office) {}

  public record ClaimDetail(
      String ref, String type, String state, Long amountMinor,
      Assessor assessor, List<Stage> stages, List<Document> documents) {}

  /**
   * Read a claim by its reference.
   *
   * <p>{@code stages} is the audit log itself rather than a summary of it — the same rows, in the
   * same order, that the USSD line reads back.
   */
  public ClaimDetail byRef(SessionUser session, String ref) {
    var row =
        db.sql(
                """
                SELECT c.id, c.claim_ref, c.member_id, c.type::text AS type,
                       c.state::text AS state, c.amount_minor, u.full_name AS assessor_name
                  FROM claims c LEFT JOIN users u ON u.id = c.assessor_user_id
                 WHERE c.claim_ref = :ref
                """)
            .param("ref", ref)
            .query(
                (rs, n) ->
                    new Object[] {
                      rs.getObject("id", UUID.class),
                      rs.getString("claim_ref"),
                      rs.getObject("member_id", UUID.class),
                      rs.getString("type"),
                      rs.getString("state"),
                      rs.getObject("amount_minor") == null ? null : rs.getLong("amount_minor"),
                      rs.getString("assessor_name")
                    })
            .optional()
            .orElseThrow(() -> ApiException.notFound("No claim with that reference."));

    var claimId = (UUID) row[0];
    var memberId = (UUID) row[2];

    // An assessor reads any claim; everyone else reads only their own member's.
    var assessing = session.role() == Role.ASSESSOR || session.role() == Role.CSP_ADMIN;
    if (!assessing && !memberId.equals(session.memberId())) {
      throw ApiException.forbidden("That claim is not yours.");
    }

    var stages =
        db.sql(
                """
                SELECT stage_key, state, actor, note, occurred_at
                  FROM claim_stages WHERE claim_id = :c ORDER BY occurred_at, id
                """)
            .param("c", claimId)
            .query(
                (rs, n) ->
                    new Stage(
                        rs.getString("stage_key"),
                        rs.getString("state"),
                        Rows.instant(rs, "occurred_at"),
                        rs.getString("actor"),
                        rs.getString("note")))
            .list();

    var documents =
        db.sql(
                """
                SELECT doc_key, state, filename, uploaded_at
                  FROM claim_documents WHERE claim_id = :c ORDER BY doc_key
                """)
            .param("c", claimId)
            .query(
                (rs, n) ->
                    new Document(
                        rs.getString("doc_key"),
                        rs.getString("state"),
                        rs.getString("filename"),
                        Rows.instant(rs, "uploaded_at")))
            .list();

    var assessorName = (String) row[6];
    return new ClaimDetail(
        (String) row[1], (String) row[3], (String) row[4], (Long) row[5],
        assessorName == null ? null : new Assessor(assessorName, "Lagos claims office"),
        stages, documents);
  }

  public record DocumentResult(String docKey, int outstanding) {}

  @Transactional
  public DocumentResult attachDocument(
      SessionUser session, String ref, String docKey, String filename,
      String contentType, int byteSize, String storageKey) {

    var claim =
        db.sql("SELECT id, member_id FROM claims WHERE claim_ref = :ref")
            .param("ref", ref)
            .query((rs, n) -> new Object[] {rs.getObject("id", UUID.class), rs.getObject("member_id", UUID.class)})
            .optional()
            .orElseThrow(() -> ApiException.notFound("No claim with that reference."));

    if (!claim[1].equals(session.memberId())) {
      throw ApiException.forbidden("That claim is not yours.");
    }

    var updated =
        db.sql(
                """
                UPDATE claim_documents
                   SET state = 'received', filename = :f, content_type = :ct,
                       byte_size = :size, storage_key = :key, uploaded_at = now()
                 WHERE claim_id = :c AND doc_key = :k
                """)
            .param("f", filename)
            .param("ct", contentType)
            .param("size", byteSize)
            .param("key", storageKey)
            .param("c", claim[0])
            .param("k", docKey)
            .update();

    // The required list is derived server-side, so a client asking to attach
    // something outside it is out of date rather than right.
    if (updated == 0) {
      throw ApiException.badRequest("%s is not a document this claim asks for.".formatted(docKey));
    }

    var outstanding =
        db.sql("SELECT count(*)::int FROM claim_documents WHERE claim_id = :c AND state = 'required'")
            .param("c", claim[0])
            .query(Integer.class)
            .single();

    if (outstanding == 0) {
      db.sql("UPDATE claims SET state = 'assessing' WHERE id = :c").param("c", claim[0]).update();
      stage((UUID) claim[0], "documents_received", "done", session.userId().toString(),
          "All required documents received");
    }

    return new DocumentResult(docKey, outstanding);
  }

  public record MyClaim(String ref, String type, String state, Long amountMinor, Instant openedAt) {}

  /**
   * A member's own claims, newest first.
   *
   * Without this the app cannot show a member the claim they opened: it knows
   * the reference only for as long as the screen that created it is on screen,
   * and after that there is nothing to look up. The assessor's queue is not a
   * substitute — it is a different role reading every member's claims, and RLS
   * refuses it here for exactly that reason.
   *
   * Scoped by the session's member id rather than by a parameter, so there is no
   * request shape in which one member asks for another's.
   */
  public List<MyClaim> mine(SessionUser session) {
    if (session.memberId() == null) {
      throw ApiException.badRequest("Only a member has claims of their own.");
    }
    return db.sql(
            """
            SELECT claim_ref, type::text AS type, state::text AS state, amount_minor, created_at
              FROM claims
             WHERE member_id = :m
             ORDER BY created_at DESC
             LIMIT 50
            """)
        .param("m", session.memberId())
        .query(
            (rs, n) ->
                new MyClaim(
                    rs.getString("claim_ref"),
                    rs.getString("type"),
                    rs.getString("state"),
                    rs.getObject("amount_minor") == null ? null : rs.getLong("amount_minor"),
                    Rows.instant(rs, "created_at")))
        .list();
  }

  public record QueueItem(
      String ref, String type, String state, Instant openedAt,
      String memberName, String cspId, int outstandingDocs) {}

  /** The assessor's queue. A different role, and a different organisation. */
  public List<QueueItem> queue() {
    return db.sql(
            """
            SELECT c.claim_ref, c.type::text AS type, c.state::text AS state, c.created_at,
                   m.display_name, m.csp_id,
                   (SELECT count(*) FILTER (WHERE d.state = 'required')
                      FROM claim_documents d WHERE d.claim_id = c.id)::int AS outstanding
              FROM claims c JOIN members m ON m.id = c.member_id
             WHERE c.state <> 'paid'
             ORDER BY c.created_at
             LIMIT 100
            """)
        .query(
            (rs, n) ->
                new QueueItem(
                    rs.getString("claim_ref"),
                    rs.getString("type"),
                    rs.getString("state"),
                    Rows.instant(rs, "created_at"),
                    rs.getString("display_name"),
                    rs.getString("csp_id"),
                    rs.getInt("outstanding")))
        .list();
  }

  @Transactional
  public String assess(SessionUser session, String ref, String decision, String note, Long amountMinor) {
    if ("approve".equals(decision) && amountMinor == null) {
      throw ApiException.badRequest("An approval needs the amount being approved.");
    }

    var claimId =
        db.sql("SELECT id FROM claims WHERE claim_ref = :ref")
            .param("ref", ref)
            .query(UUID.class)
            .optional()
            .orElseThrow(() -> ApiException.notFound("No claim with that reference."));

    var nextState =
        switch (decision) {
          case "approve" -> "approved";
          case "decline" -> "declined";
          default -> "documents_pending";
        };

    db.sql(
            """
            UPDATE claims
               SET state = CAST(:s AS claim_state),
                   amount_minor = COALESCE(:amt, amount_minor),
                   assessor_user_id = :u
             WHERE id = :id
            """)
        .param("s", nextState)
        .param("amt", amountMinor)
        .param("u", session.userId())
        .param("id", claimId)
        .update();

    stage(claimId, "request_more".equals(decision) ? "more_needed" : nextState, "done",
        session.userId().toString(), note);
    return nextState;
  }

  public record Paid(String ref, String state, String sessionId, long amountMinor, String accountName) {}

  /**
   * Send an approved claim's money.
   *
   * <p>The last step of the product, and the one place in this system where a mistake cannot be
   * corrected by editing a row. Four things stand between an instruction and a wrong payment, and
   * none of them is a comment:
   *
   * <ol>
   *   <li>The claim must already be approved. Paying an unassessed claim is not a shortcut, it is
   *       the control removed.
   *   <li>The payer is not the assessor — {@code PERM_CLAIM_PAY} belongs to operations and
   *       {@code PERM_CLAIM_ASSESS} to the assessor, and the {@code payer_is_not_assessor}
   *       constraint says so again in the database, where it cannot be argued with.
   *   <li>NIBSS is asked whose account this is before anything is sent to it. The name it returns
   *       is what gets stored, because the point is to catch the digit that was typed wrong.
   *   <li>The claim reference is the idempotency key. A second instruction for the same claim is
   *       refused by a unique index in the replay log rather than by anyone remembering.
   * </ol>
   */
  @Transactional
  public Paid pay(SessionUser session, String ref, String bankCode, String accountNumber) {
    var claim =
        db.sql(
                """
                SELECT id, state::text AS state, amount_minor, assessor_user_id, paid_at
                  FROM claims WHERE claim_ref = :ref
                """)
            .param("ref", ref)
            .query(
                (rs, n) ->
                    new Object[] {
                      rs.getObject("id", UUID.class),
                      rs.getString("state"),
                      rs.getObject("amount_minor") == null ? null : rs.getLong("amount_minor"),
                      rs.getObject("assessor_user_id", UUID.class),
                      rs.getObject("paid_at")
                    })
            .optional()
            .orElseThrow(() -> ApiException.notFound("No claim with that reference."));

    var claimId = (UUID) claim[0];
    var state = (String) claim[1];
    var amountMinor = (Long) claim[2];
    var assessor = (UUID) claim[3];

    if (claim[4] != null) {
      throw ApiException.conflict("already_paid", "That claim has already been paid.");
    }
    if (!"approved".equals(state)) {
      throw ApiException.conflict(
          "not_approved", "Only an approved claim can be paid. This one is %s.".formatted(state));
    }
    if (amountMinor == null || amountMinor <= 0) {
      throw ApiException.conflict("no_amount", "That claim has no approved amount.");
    }
    if (session.userId().equals(assessor)) {
      throw ApiException.conflict(
          "assessor_is_payer",
          "You assessed this claim. Someone else has to send the money — that is the whole point "
              + "of the check.");
    }

    // Ask the bank who this account belongs to, before sending anything to it.
    var accountName = payout.resolveAccountName(bankCode, accountNumber, ref);

    Payout.Transferred sent;
    try {
      sent =
          payout.transfer(
              new Payout.Account(bankCode, accountNumber, accountName),
              amountMinor,
              "CSP claim " + ref,
              ref);
    } catch (ReplayLog.AlreadyDone e) {
      // The instruction is already out. Saying so is the only safe answer: the
      // alternative is a second transfer for the same claim.
      throw ApiException.conflict(
          "already_instructed",
          "A payment for that claim has already been instructed. Check the replay log before "
              + "sending another.");
    }

    db.sql(
            """
            UPDATE claims
               SET state = 'paid',
                   payout_bank_code = :bank,
                   payout_account_number = :acct,
                   payout_account_name = :name,
                   payout_session_id = :session,
                   paid_at = now(),
                   paid_by = :by
             WHERE id = :id
            """)
        .param("bank", bankCode)
        .param("acct", accountNumber)
        .param("name", accountName)
        .param("session", sent.sessionId())
        .param("by", session.userId())
        .param("id", claimId)
        .update();

    stage(claimId, "paid", "done", session.userId().toString(), "Paid to " + accountName);
    return new Paid(ref, "paid", sent.sessionId(), sent.amountMinor(), accountName);
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /** CLM-2026-0091. Short enough to read down a phone line. */
  private String nextRef() {
    var year = LocalDate.now(ZoneOffset.UTC).getYear();
    var n =
        db.sql(
                """
                SELECT COALESCE(MAX(substring(claim_ref from 10)::int), 0) + 1
                  FROM claims WHERE claim_ref LIKE :prefix
                """)
            .param("prefix", "CLM-" + year + "-%")
            .query(Integer.class)
            .single();
    return "CLM-%d-%04d".formatted(year, n);
  }

  private void stage(UUID claimId, String key, String state, String actor, String note) {
    db.sql(
            """
            INSERT INTO claim_stages (claim_id, stage_key, state, actor, note)
            VALUES (:c, :k, :s, :a, :n)
            """)
        .param("c", claimId)
        .param("k", key)
        .param("s", state)
        .param("a", actor)
        .param("n", note)
        .update();
  }

  private void requireDocs(UUID claimId, List<String> keys) {
    for (var key : keys) {
      db.sql("INSERT INTO claim_documents (claim_id, doc_key, state) VALUES (:c, :k, 'required')")
          .param("c", claimId)
          .param("k", key)
          .update();
    }
  }
}
