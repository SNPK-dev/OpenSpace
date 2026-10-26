package objectstore

import (
	"context"
	"fmt"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"openspace/worker/internal/maintenance"
	"time"
)

type Store struct {
	client *minio.Client
	bucket string
}

func New(endpoint, access, secret, bucket string, ssl bool) (*Store, error) {
	client, err := minio.New(endpoint, &minio.Options{Creds: credentials.NewStaticV4(access, secret, ""), Secure: ssl})
	if err != nil {
		return nil, err
	}
	return &Store{client: client, bucket: bucket}, nil
}
func (s *Store) Candidates(ctx context.Context, cutoff time.Time, limit int) ([]maintenance.ObjectCandidate, error) {
	out := []maintenance.ObjectCandidate{}
	for object := range s.client.ListObjects(ctx, s.bucket, minio.ListObjectsOptions{Recursive: true}) {
		if object.Err != nil {
			return nil, object.Err
		}
		if object.LastModified.Before(cutoff) {
			out = append(out, maintenance.ObjectCandidate{Key: object.Key, Modified: object.LastModified})
			if len(out) >= limit {
				break
			}
		}
	}
	return out, nil
}
func (s *Store) Remove(ctx context.Context, key string) error {
	return s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
}

func (s *Store) Ping(ctx context.Context) error {
	exists, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("bucket %q does not exist", s.bucket)
	}
	return nil
}
