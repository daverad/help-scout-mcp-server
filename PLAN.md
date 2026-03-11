# Implementation Plan: Help Scout Write Access (Issue #14)

## 1. Analysis Summary

### Current State
The MCP server (v1.6.2) exposes **9 read-only tools** for searching/listing conversations, threads, and inboxes. The `HelpScoutClient` only has a `get()` method — no `post()`, `patch()`, or `put()`.

### Help Scout API Write Capabilities (Mailbox API v2)
The following write endpoints are publicly documented and available:

| Endpoint | Method | URL | Purpose |
|----------|--------|-----|---------|
| Create Reply Thread | POST | `/v2/conversations/{id}/reply` | Send a reply on a conversation |
| Create Note | POST | `/v2/conversations/{id}/notes` | Add internal note |
| Update Conversation | PATCH | `/v2/conversations/{id}` | Change status, subject, assignee |
| Create Conversation | POST | `/v2/conversations` | Create new conversation |
| Create Customer Thread | POST | `/v2/conversations/{id}/customer` | Add customer-originated thread |
| Update Thread | PATCH | `/v2/conversations/{id}/threads/{threadId}` | Edit existing thread text |
| Update Custom Fields | PUT | `/v2/conversations/{id}/fields` | Update custom field values |

### Rate Limiting Impact
- **Write operations (POST/PUT/PATCH/DELETE) count as 2 requests** toward the rate limit (vs 1 for GET)
- Limits are plan-dependent; 429 responses include `Retry-After` header
- The existing retry logic already handles 429s with exponential backoff

---

## 2. Safety & Privacy Concerns

### Critical Safety Concerns

1. **Accidental email delivery**: A reply with `draft: false` sends a real email to the customer immediately. There is no undo. This is the highest-risk operation.
   - **Mitigation**: Default `draft: true` on all reply operations. The tool description will clearly state that non-draft replies send real emails.

2. **Status changes are immediate**: Closing a conversation may trigger automations, satisfaction surveys, or SLA resets in Help Scout.
   - **Mitigation**: Require explicit confirmation in tool descriptions; provide clear warnings.

3. **Thread limit**: Conversations have a max of 100 threads. Adding threads to near-limit conversations returns 412.
   - **Mitigation**: Handle 412 errors with clear messaging.

4. **PII exposure**: Reply/note text may contain customer PII. The existing `REDACT_MESSAGE_CONTENT` env var controls read-side redaction, but write operations inherently require handling customer data.
   - **Mitigation**: Log write operations at info level but never log the body/text content. Respect existing PII settings.

5. **Irreversibility**: Sent replies cannot be unsent. Notes can be deleted via the UI but not the API. Status changes can be reversed but automations triggered cannot.
   - **Mitigation**: Document this clearly. Default to safest options (draft mode).

### Privacy Concerns

1. **Customer email addresses**: The `createReply` tool requires a customer object. AI agents will be passing customer email addresses through the MCP protocol.
   - **Mitigation**: This is inherent to the use case and already happens in read operations. No additional exposure.

2. **CC/BCC fields**: Could accidentally expose email addresses to unintended recipients.
   - **Mitigation**: Make CC/BCC optional; validate email format before sending.

3. **Audit trail**: All API actions are logged in Help Scout's activity log under the OAuth app's identity, providing accountability.

### Opt-in Gate

The issue suggests an env var `HELPSCOUT_ENABLE_WRITES=true`. This is a good safety layer:
- **Default: writes disabled** — Server starts in read-only mode unless explicitly opted in
- Prevents accidental write access if someone upgrades the package without knowing about new tools
- The OAuth app permissions at Help Scout's end provide a second layer of access control

---

## 3. Technical Limitations

1. **No draft-to-send API**: There's no API endpoint to publish/send an existing draft. Drafts can only be sent from the Help Scout UI. This means `draft: true` replies must be manually sent by a human.
   - This is actually a **feature for safety** — it enforces human review.

2. **No delete thread API**: Threads (notes, replies) cannot be deleted via API once created.

3. **No attachment download URL**: Attachments must be base64-encoded inline (max request size 256KB for conversations, 100KB for threads). We will **not** support attachments in v1 to keep scope manageable.

4. **JSONPatch format**: The update conversation endpoint uses JSON Patch format (`op`/`path`/`value`), not a simple JSON body. Only supports `replace` operation.

5. **Conversation merging**: If a conversation has been merged, the old ID returns 404. The client already handles this in `transformError`.

6. **100-thread limit per conversation**: API returns 412 if exceeded.

7. **Company policy restrictions**: Some Help Scout accounts have policies preventing updates to old conversations (returns 412).

---

## 4. Proposed Tools (Scope)

Based on the issue request and API capabilities, implement these **3 tools** (matching the issue) plus the opt-in gate:

### Tool 1: `createReply`
- **API**: `POST /v2/conversations/{conversationId}/reply`
- **Required params**: `conversationId` (number), `text` (string), `customer` (object with `email`)
- **Optional params**: `draft` (boolean, **default: true**), `cc` (string[]), `bcc` (string[])
- **Omitted**: `attachments` (keep v1 simple), `imported`, `assignTo`
- **Returns**: Success confirmation with conversation ID and draft status

### Tool 2: `updateConversationStatus`
- **API**: `PATCH /v2/conversations/{conversationId}`
- **Required params**: `conversationId` (number), `status` (enum: 'active' | 'pending' | 'closed')
- **Note**: Uses JSON Patch format: `{ "op": "replace", "path": "/status", "value": "<status>" }`
- **Omitted**: `spam` status (too destructive), subject/assignee changes (keep focused)
- **Returns**: Success confirmation with new status

### Tool 3: `createNote`
- **API**: `POST /v2/conversations/{conversationId}/notes`
- **Required params**: `conversationId` (number), `text` (string)
- **Optional params**: none in v1
- **Returns**: Success confirmation with conversation ID

---

## 5. Implementation Plan

### Step 1: Add `HELPSCOUT_ENABLE_WRITES` environment variable
**Files**: `src/utils/config.ts`

- Add `enableWrites: boolean` to the config interface under a new `writes` section
- Read from `HELPSCOUT_ENABLE_WRITES` env var (default: `false`)
- Log at startup whether writes are enabled

### Step 2: Add `post()` and `patch()` methods to `HelpScoutClient`
**Files**: `src/utils/helpscout-client.ts`

- Add `post<T>(endpoint, data)` method — no caching, uses `executeWithRetry`
- Add `patch<T>(endpoint, data)` method — no caching, uses `executeWithRetry`
- Both methods should invalidate cache for the affected conversation endpoint
- Update `validateStatus` handling: currently the client doesn't throw on 4xx (line 113), which works for GET but for POST/PATCH we need to handle 201 (Created, no body) and 204 (No Content) responses

### Step 3: Add Zod schemas for write operations
**Files**: `src/schema/types.ts`

- `CreateReplyInputSchema` — validates conversationId, text, customer, draft, cc, bcc
- `UpdateConversationStatusInputSchema` — validates conversationId, status enum
- `CreateNoteInputSchema` — validates conversationId, text
- Email validation for customer.email, cc[], bcc[]

### Step 4: Implement write tool handlers
**Files**: `src/tools/index.ts`

- Add `createReply`, `updateConversationStatus`, `createNote` tool definitions
- Each tool checks `config.writes.enableWrites` first — returns clear error if disabled
- Tool descriptions include safety warnings about draft mode and irreversibility
- Tools invalidate relevant cache entries after successful writes
- Return structured success responses with what was done

### Step 5: Update server instructions
**Files**: `src/index.ts`

- Add write tools to the dynamic server instructions
- Include safety guidance about draft mode defaults
- Mention the opt-in requirement

### Step 6: Add 412 error handling
**Files**: `src/utils/helpscout-client.ts`

- Handle 412 Precondition Failed in `transformError` — thread limit or policy restriction
- Provide clear user-facing message about the cause

### Step 7: Write tests
**Files**: `src/__tests__/write-tools.test.ts` (new file)

- Test each tool with mocked API responses (nock)
- Test write-gate disabled behavior (tools return error)
- Test write-gate enabled behavior (tools call API)
- Test error scenarios: 412, 422, 404, 429
- Test input validation (missing required fields, invalid email, invalid status)
- Test cache invalidation after writes

### Step 8: Update README documentation
**Files**: `README.md`

- Document new tools in the tools section
- Document `HELPSCOUT_ENABLE_WRITES` env var
- Add safety section about draft mode defaults
- Update configuration examples

---

## 6. File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/utils/config.ts` | Modify | Add `enableWrites` config |
| `src/utils/helpscout-client.ts` | Modify | Add `post()`, `patch()` methods; handle 412 |
| `src/schema/types.ts` | Modify | Add write input/output schemas |
| `src/tools/index.ts` | Modify | Add 3 new tool implementations |
| `src/index.ts` | Modify | Update server instructions |
| `src/__tests__/write-tools.test.ts` | New | Tests for write operations |
| `README.md` | Modify | Document new tools and config |

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AI sends real email via non-draft reply | Medium | High | `draft: true` default, clear tool description |
| Rate limit exhaustion from writes (2x cost) | Low | Medium | Existing retry logic handles 429s |
| Customer PII in logs | Low | High | Never log request body text |
| Accidental status change triggers automation | Medium | Medium | Clear tool description, explicit status param |
| Breaking existing read-only users on upgrade | Low | Low | Opt-in gate (`HELPSCOUT_ENABLE_WRITES`) |
| 412 errors from thread limits | Low | Low | Clear error message, no retry |
