package ng.csp.api.claim;

import java.io.InputStream;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import ng.csp.api.auth.Permission;
import ng.csp.api.auth.Role;
import ng.csp.api.auth.SessionUser;
import ng.csp.api.domain.Claims;
import ng.csp.api.evidence.Evidence;
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
  private final Evidence evidence;

  public ClaimService(JdbcClient db, ObjectMapper json, Payout payout, Evidence evidence) {
    this.db = db;
    this.json = json;
    this.payout = payout;
    this.evidence = evidence;
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
    /*
     * A relative may report a death and nothing else.
     *
     * Accident and disability claims are about a living member and are theirs
     * to make: they are the one who knows what happened, and the payout is
     * theirs. A next-of-kin session exists because the member cannot sign in,
     * which is only true of the one claim type.
     */
    if (session.role() == Role.NEXT_OF_KIN && !"death".equals(type)) {
      throw ApiException.forbidden(
          "A next of kin can report a death. An accident or disability claim is made by the member.");
    }

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

    // Who opened it, on the trail. "Opened on the member app" was true of every
    // claim when only a member could open one; on a death claim it is now
    // usually a relative, and an assessor reading the trail should see that.
    stage(
        claimId, "submitted", "done", session.userId().toString(),
        session.role() == Role.NEXT_OF_KIN
            ? "Reported by the next of kin"
            : "Opened on the member app");
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

  /**
   * Somewhere to put one document, and permission to put it there.
   *
   * <p>Two calls rather than one, because the bytes do not come through this service: the client
   * asks where to send the file, sends it to object storage itself, and then confirms. Ten megabytes
   * of scanned certificate through a request thread is a thread spent copying, and on a claim surge
   * those threads are wanted for claims.
   *
   * <p>The storage key is chosen here and never accepted from the caller. A key a caller picks is a
   * path a caller can traverse, and until this existed the API wrote down whatever string it was
   * handed.
   */
  @Transactional
  public Evidence.Upload beginUpload(
      SessionUser session, String ref, String docKey, String filename,
      String contentType, int byteSize) {

    var claim = ownClaim(session, ref);

    /*
     * One key per upload attempt, not per document. A second attempt writes a
     * new object rather than overwriting the first, which is what object lock
     * requires and what lets an assessor see that a file was replaced rather
     * than quietly find different bytes behind the same key.
     */
    var key = "claims/%s/%s/%s%s".formatted(claim[0], docKey, UUID.randomUUID(), extensionFor(contentType));

    var updated =
        db.sql(
                """
                UPDATE claim_documents
                   SET filename = :f, content_type = :ct, byte_size = :size, storage_key = :key
                 WHERE claim_id = :c AND doc_key = :k AND state <> 'received'
                """)
            .param("f", filename)
            .param("ct", contentType)
            .param("size", byteSize)
            .param("key", key)
            .param("c", claim[0])
            .param("k", docKey)
            .update();

    if (updated == 0) {
      throw ApiException.badRequest(
          "%s is not a document this claim is still waiting for.".formatted(docKey));
    }

    return evidence.begin(key, contentType, byteSize);
  }

  /** The extension keeps a downloaded file openable; the content type is what is enforced. */
  private static String extensionFor(String contentType) {
    return switch (contentType) {
      case "application/pdf" -> ".pdf";
      case "image/png" -> ".png";
      default -> ".jpg";
    };
  }

  /**
   * Confirm the bytes arrived.
   *
   * <p>Checked against the store rather than believed. A client that says it uploaded and did not —
   * a dropped connection, a cancelled request, a presigned URL that expired mid-transfer — would
   * otherwise move the claim to assessing with nothing behind the row, and the first person to find
   * out would be the assessor with an empty document to read.
   */
  @Transactional
  public DocumentResult attachDocument(SessionUser session, String ref, String docKey) {

    var claim = ownClaim(session, ref);

    /*
     * Coalesced, because `optional()` on a row whose only column is NULL comes
     * back empty — which would report a document the claim does not ask for
     * when what happened is that nobody asked for an upload URL yet. Two
     * different mistakes by the client, and they need two different messages.
     */
    var storageKey =
        db.sql(
                """
                SELECT coalesce(storage_key, '') FROM claim_documents
                 WHERE claim_id = :c AND doc_key = :k
                """)
            .param("c", claim[0])
            .param("k", docKey)
            .query(String.class)
            .optional()
            // The required list is derived server-side, so a client asking to
            // attach something outside it is out of date rather than right.
            .orElseThrow(
                () ->
                    ApiException.badRequest(
                        "%s is not a document this claim asks for.".formatted(docKey)));

    if (storageKey.isEmpty()) {
      throw ApiException.badRequest("Ask for an upload URL for %s first.".formatted(docKey));
    }
    if (!evidence.exists(storageKey)) {
      throw ApiException.badRequest("That file did not arrive. Send it again.");
    }

    db.sql(
            """
            UPDATE claim_documents SET state = 'received', uploaded_at = now()
             WHERE claim_id = :c AND doc_key = :k
            """)
        .param("c", claim[0])
        .param("k", docKey)
        .update();

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

    shareWithTheAdvance(session, (UUID) claim[0], docKey, storageKey);
    return new DocumentResult(docKey, outstanding);
  }

  /**
   * The funeral advance takes the same papers as the death claim beside it.
   *
   * <p>A death claim opens an advance automatically, and both ask for the death
   * certificate and the claimant's ID. Asking for them twice means a bereaved family
   * photographing a certificate again for a claim they did not know they had opened — and an
   * advance that sits at {@code documents_pending} forever, which is the one claim in the scheme
   * that is supposed to be quick.
   *
   * <p>The same object, not a copy: one upload, two claims pointing at it. Nothing is duplicated in
   * storage and the two records cannot drift apart.
   */
  private void shareWithTheAdvance(SessionUser session, UUID parentId, String docKey, String storageKey) {
    var advance =
        db.sql("SELECT id FROM claims WHERE parent_claim_id = :p AND type = 'funeral_advance'")
            .param("p", parentId)
            .query(UUID.class)
            .optional();
    if (advance.isEmpty()) {
      return;
    }

    var shared =
        db.sql(
                """
                UPDATE claim_documents child
                   SET state = 'received', filename = parent.filename,
                       content_type = parent.content_type, byte_size = parent.byte_size,
                       storage_key = parent.storage_key, uploaded_at = now()
                  FROM claim_documents parent
                 WHERE child.claim_id = :advance AND child.doc_key = :k
                   AND child.state <> 'received'
                   AND parent.claim_id = :parent AND parent.doc_key = :k
                """)
            .param("advance", advance.get())
            .param("parent", parentId)
            .param("k", docKey)
            .update();
    if (shared == 0) {
      return;
    }

    var outstanding =
        db.sql("SELECT count(*)::int FROM claim_documents WHERE claim_id = :c AND state = 'required'")
            .param("c", advance.get())
            .query(Integer.class)
            .single();
    if (outstanding == 0) {
      db.sql("UPDATE claims SET state = 'assessing' WHERE id = :c").param("c", advance.get()).update();
      stage(advance.get(), "documents_received", "done", session.userId().toString(),
          "Taken from the death claim — the same papers, not sent twice");
    }
  }

  /** The claim, if it is this member's. Everything a claimant does goes through here. */
  private Object[] ownClaim(SessionUser session, String ref) {
    var claim =
        db.sql("SELECT id, member_id FROM claims WHERE claim_ref = :ref")
            .param("ref", ref)
            .query(
                (rs, n) ->
                    new Object[] {
                      rs.getObject("id", UUID.class), rs.getObject("member_id", UUID.class)
                    })
            .optional()
            .orElseThrow(() -> ApiException.notFound("No claim with that reference."));

    if (!claim[1].equals(session.memberId())) {
      throw ApiException.forbidden("That claim is not yours.");
    }
    return claim;
  }

  /** A stored document, ready to stream. */
  public record StoredDocument(String filename, String contentType, InputStream body) {}

  /**
   * Read a document back.
   *
   * <p>An assessor may read anybody's, because deciding a claim means looking at the certificate;
   * everybody else may read only their own, checked against the claim's member rather than against
   * the reference, which is guessable enough to matter.
   */
  public StoredDocument document(SessionUser session, String ref, String docKey) {
    var assessor = session.role().can(Permission.CLAIM_READ_ANY);
    var claimId = assessor ? anyClaim(ref) : (UUID) ownClaim(session, ref)[0];

    var row =
        db.sql(
                """
                SELECT storage_key, filename, content_type FROM claim_documents
                 WHERE claim_id = :c AND doc_key = :k AND state = 'received'
                """)
            .param("c", claimId)
            .param("k", docKey)
            .query(
                (rs, n) ->
                    new String[] {
                      rs.getString("storage_key"),
                      rs.getString("filename"),
                      rs.getString("content_type")
                    })
            .optional()
            .orElseThrow(() -> ApiException.notFound("That document has not been uploaded."));

    return new StoredDocument(row[1], row[2], evidence.read(row[0]));
  }

  private UUID anyClaim(String ref) {
    return db.sql("SELECT id FROM claims WHERE claim_ref = :ref")
        .param("ref", ref)
        .query(UUID.class)
        .optional()
        .orElseThrow(() -> ApiException.notFound("No claim with that reference."));
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

  /**
   * A claim on a sponsor's member, as the sponsor may see it.
   *
   * <p>Deliberately thin, and the thinness is the product. A sponsor is the employer: they need to
   * know a claim exists so they can answer the one question the insurer asks them — was this person
   * in service on that date — and so an HR officer can be kind to a family walking into their
   * office. They do not need the cause of death, the medical documents, the diagnosis, or the
   * beneficiary's bank details, and this record cannot carry them.
   *
   * <p>The amount is not here either. What a family is paid is between them and the insurer; an
   * employer knowing their late colleague's household received ₦5,000,000 is a disclosure nobody
   * consented to. Aggregate figures are fine and are what the screen shows.
   */
  public record SponsorClaim(
      String ref, String type, String state, Instant openedAt, String memberName, String cspId,
      /** Whether the insurer is waiting on the employer for something. */
      boolean awaitingSponsor) {}

  public record SponsorClaims(List<SponsorClaim> claims, int open, int paidThisYear, long paidThisYearMinor) {}

  /**
   * Claims on this sponsor's members.
   *
   * <p>Scoped by row-level security rather than by this query: the caller's scope is their own
   * sponsor, so a sponsor id in the request that is not theirs returns nothing rather than someone
   * else's members — see RlsScope and the members_by_rail policy.
   */
  public SponsorClaims forSponsor(UUID sponsorId) {
    var claims =
        db.sql(
                """
                /*
                 * A projection, not `claims`.
                 *
                 * `claims` is closed to a sponsor by policy and stays closed: a
                 * policy loose enough to let them read the row lets them read
                 * the amount, the assessor's note and the payout account through
                 * any query that asks, because RLS is row-level and this
                 * restriction is about columns. sponsor_claim_view holds the
                 * few facts an employer is entitled to and cannot grow the rest
                 * by accident. See V10.
                 */
                SELECT v.claim_ref, v.type, v.state, v.created_at, v.awaiting_sponsor,
                       m.display_name, m.csp_id
                  FROM sponsor_claim_view v JOIN members m ON m.id = v.member_id
                 WHERE v.sponsor_id = :s AND v.paid_at IS NULL
                 ORDER BY v.created_at DESC
                 LIMIT 100
                """)
            .param("s", sponsorId)
            .query(
                (rs, n) ->
                    new SponsorClaim(
                        rs.getString("claim_ref"),
                        rs.getString("type"),
                        rs.getString("state"),
                        Rows.instant(rs, "created_at"),
                        rs.getString("display_name"),
                        rs.getString("csp_id"),
                        rs.getBoolean("awaiting_sponsor")))
            .list();

    /*
     * Paid this year, in total. An employer seeing "₦18.4m went to the families
     * of your staff" is the number that gets a scheme renewed, and it discloses
     * nothing about any one household.
     */
    var totals =
        db.sql(
                """
                SELECT paid_count AS n, paid_minor AS total FROM csp.sponsor_claims_paid(:s)
                """)
            .param("s", sponsorId)
            .query((rs, n) -> new long[] {rs.getInt("n"), rs.getLong("total")})
            .single();

    return new SponsorClaims(claims, claims.size(), (int) totals[0], totals[1]);
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
