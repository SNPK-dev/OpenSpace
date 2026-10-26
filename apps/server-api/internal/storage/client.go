package storage

import (
	"context"
	"fmt"
	"mime"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Client struct {
	mc      *minio.Client
	presign *minio.Client
	bucket  string
}

func (c *Client) Ping(ctx context.Context) error {
	_, err := c.mc.BucketExists(ctx, c.bucket)
	return err
}

func NewClient(endpoint, publicEndpoint, accessKey, secretKey, bucket string, useSSL, publicUseSSL bool) (*Client, error) {
	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
		Region: "us-east-1",
	})
	if err != nil {
		return nil, fmt.Errorf("minio client: %w", err)
	}
	presign, err := minio.New(publicEndpoint, &minio.Options{
		Creds: credentials.NewStaticV4(accessKey, secretKey, ""), Secure: publicUseSSL,
		Region: "us-east-1",
	})
	if err != nil {
		return nil, fmt.Errorf("public minio client: %w", err)
	}
	return &Client{mc: mc, presign: presign, bucket: bucket}, nil
}

func (c *Client) PresignPut(ctx context.Context, objectKey, contentType string, sizeLimitBytes int64, ttl time.Duration) (string, error) {
	params := url.Values{}
	params.Set("response-content-type", contentType)

	u, err := c.presign.PresignedPutObject(ctx, c.bucket, objectKey, ttl)
	if err != nil {
		return "", fmt.Errorf("presign put: %w", err)
	}
	return u.String(), nil
}

func (c *Client) Head(ctx context.Context, objectKey string) (bool, int64, error) {
	info, err := c.mc.StatObject(ctx, c.bucket, objectKey, minio.StatObjectOptions{})
	if err != nil {
		errResp := minio.ToErrorResponse(err)
		if errResp.Code == "NoSuchKey" || errResp.StatusCode == 404 {
			return false, 0, nil
		}
		return false, 0, fmt.Errorf("stat object: %w", err)
	}
	return true, info.Size, nil
}

func (c *Client) PresignGet(ctx context.Context, objectKey, filename string, ttl time.Duration) (string, error) {
	params := url.Values{}
	params.Set("response-content-disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	u, err := c.presign.PresignedGetObject(ctx, c.bucket, objectKey, ttl, params)
	if err != nil {
		return "", fmt.Errorf("presign get: %w", err)
	}
	return u.String(), nil
}
