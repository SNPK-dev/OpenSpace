package ctxkey

import "context"

type ContextIdentity struct {
	ID        string
	ServerID  string
	Username  string
	SessionID string
}

type key int

const identityKey key = 0

func Set(ctx context.Context, identity *ContextIdentity) context.Context {
	return context.WithValue(ctx, identityKey, identity)
}

func Get(ctx context.Context) *ContextIdentity {
	v, _ := ctx.Value(identityKey).(*ContextIdentity)
	return v
}
