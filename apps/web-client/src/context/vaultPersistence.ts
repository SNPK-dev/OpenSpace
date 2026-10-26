export function createSerializedWriteQueue<T>(
  write: (snapshot: T) => Promise<void>,
): (snapshot: T) => Promise<void> {
  let queue: Promise<void> = Promise.resolve()

  return (snapshot: T) => {
    const operation = queue.then(() => write(snapshot))
    queue = operation.catch(() => undefined)
    return operation
  }
}

export function withoutServerConnectivity<
  S extends object,
  T extends { servers: S[] },
>(snapshot: T): T {
  return {
    ...snapshot,
    servers: snapshot.servers.map(server => {
      const { connectivity_state: _connectivityState, ...persisted } = server as S & {
        connectivity_state?: unknown
      }
      return persisted as S
    }),
  } as T
}
