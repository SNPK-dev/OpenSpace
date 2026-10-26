FROM golang:1.27.3-alpine@sha256:b8c9b82affbbb82a020bbcf998dad2ba9516944ac7e883524642a481a9505e9c AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /worker ./cmd/worker

FROM alpine:3.24@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a
RUN addgroup -S -g 10001 openspace && adduser -S -D -H -u 10001 -G openspace openspace
COPY --from=builder --chown=openspace:openspace /worker /worker
USER openspace:openspace
EXPOSE 8090
ENTRYPOINT ["/worker"]
