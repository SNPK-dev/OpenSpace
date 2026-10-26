# Spec: attachments

## Capability

Two-phase file upload via presigned MinIO URLs. Attachments are linked to messages on send.

---

### Requirement: request-upload-url

`POST /api/v1/attachments/upload-url`

Auth required. `AttachFiles` permission required.

Request: `{ "filename": string (1-255 chars), "content_type": string (1-128 chars), "size_bytes": int (1-52428800) }`
Response (200):
```json
{
  "attachment_id": string,
  "upload_url": string,
  "expires_at": string
}
```

- `upload_url` is a presigned MinIO PUT URL valid for 5 minutes.
- Object key: `attachments/{server_id}/{attachment_id}/{filename}`
- Max size: 50 MB (enforced by MinIO presign conditions).

#### Scenario: member requests upload URL

GIVEN an authenticated member
WHEN `POST /api/v1/attachments/upload-url` with valid fields
THEN response is 200 with attachment_id and upload_url
AND an attachments record with status=pending is created

#### Scenario: guest cannot upload

GIVEN an identity with guest role only
WHEN `POST /api/v1/attachments/upload-url` is called
THEN response is 403

#### Scenario: file too large

GIVEN `{ "size_bytes": 52428801 }`
THEN response is 400 with `{ "error": "validation_error", "field": "size_bytes" }`

---

### Requirement: confirm-attachment

`POST /api/v1/attachments/{id}/confirm`

Auth required. Caller must be the attachment owner.

Response (200):
```json
{
  "id": string,
  "filename": string,
  "content_type": string,
  "size_bytes": int,
  "url": string
}
```

Server performs HEAD on the MinIO object. If not found, returns 422.
On success, status changes from pending → ready and `url` is a presigned GET URL
valid for 24 hours (long enough for display; clients should refresh if needed).

#### Scenario: successful confirm

GIVEN a pending attachment and the object exists in MinIO
WHEN `POST /api/v1/attachments/{id}/confirm`
THEN response is 200 with attachment details and access url

#### Scenario: object not in MinIO

GIVEN a pending attachment whose object was never uploaded
WHEN `POST /api/v1/attachments/{id}/confirm`
THEN response is 422 with `{ "error": "upload_not_found" }`

---

### Requirement: message-with-attachment

`POST .../messages` accepts optional `attachment_id`.

Request: `{ "content": string, "attachment_id"?: string }`

If `attachment_id` is provided:
- Attachment must be status=ready and owned by the caller.
- Message response includes `"attachment": { id, filename, content_type, size_bytes, url }`.

#### Scenario: send message with attachment

GIVEN a confirmed attachment
WHEN `POST .../messages` with `{ "content": "check this out", "attachment_id": "..." }`
THEN response is 201 with message including attachment field
AND `message.created` WebSocket event includes the attachment
