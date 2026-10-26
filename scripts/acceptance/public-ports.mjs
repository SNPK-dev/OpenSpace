import net from "node:net";
const host = process.argv[2];
if (!host) throw new Error("usage: public-ports.mjs <host>");
const allowed = [80, 443, 3478, 5349, 7881];
const forbidden = [3001, 5432, 6379, 8080, 9000, 9001, 9090, 3000];
const probe = (port) => new Promise((resolve) => { const socket = net.connect({ host, port, timeout: 3000 }); const done = (open) => { socket.destroy(); resolve(open); }; socket.once("connect", () => done(true)); socket.once("timeout", () => done(false)); socket.once("error", () => done(false)); });
for (const port of allowed) if (!await probe(port)) throw new Error(`required public TCP port is closed: ${port}`);
for (const port of forbidden) if (await probe(port)) throw new Error(`private TCP port is publicly reachable: ${port}`);
console.log(JSON.stringify({ ok: true, host, allowed, forbidden }));
