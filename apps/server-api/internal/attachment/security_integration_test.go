package attachment

import (
	"context"
	"errors"
	"testing"

	"openspace/server-api/internal/testutil"
)

func TestAttachmentCrossServerAndOwnerIsolation(t *testing.T) {
	pool := testutil.Pool(t)
	ctx := context.Background()
	var serverA, serverB string
	if err := pool.QueryRow(ctx, `INSERT INTO servers DEFAULT VALUES RETURNING id`).Scan(&serverA); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO servers DEFAULT VALUES RETURNING id`).Scan(&serverB); err != nil {
		t.Fatal(err)
	}
	owner, _ := testutil.InsertIdentity(t, pool, ctx, serverA, "device_credential", nil)
	other, _ := testutil.InsertIdentity(t, pool, ctx, serverA, "device_credential", nil)
	var attachmentID string
	if err := pool.QueryRow(ctx, `INSERT INTO attachments(server_id,identity_id,filename,content_type,size_bytes,object_key,status) VALUES($1,$2,'secret.txt','text/plain',6,$3,'ready') RETURNING id`, serverA, owner, "attachments/"+serverA+"/fixture").Scan(&attachmentID); err != nil {
		t.Fatal(err)
	}
	defer pool.Exec(ctx, `DELETE FROM attachments WHERE id=$1`, attachmentID)         //nolint:errcheck
	defer pool.Exec(ctx, `DELETE FROM servers WHERE id IN ($1,$2)`, serverA, serverB) //nolint:errcheck
	svc := NewService(pool, nil)
	if _, err := svc.Confirm(ctx, serverB, owner, attachmentID); !errors.Is(err, ErrAttachmentNotFound) {
		t.Fatalf("cross-server confirm: %v", err)
	}
	if _, err := svc.Confirm(ctx, serverA, other, attachmentID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("cross-owner confirm: %v", err)
	}
}
