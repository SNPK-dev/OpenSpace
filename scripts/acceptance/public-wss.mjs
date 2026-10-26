import tls from "node:tls";
import { randomBytes } from "node:crypto";
const target = new URL(process.argv[2] ?? "");
if (target.protocol !== "wss:") throw new Error("usage: public-wss.mjs wss://host/path");
await new Promise((resolve, reject) => {
  const socket = tls.connect({ host: target.hostname, port: Number(target.port || 443), servername: target.hostname, rejectUnauthorized: true }, () => {
    const key = randomBytes(16).toString("base64");
    socket.write(`GET ${target.pathname} HTTP/1.1\r\nHost: ${target.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nOrigin: https://${target.hostname}\r\n\r\n`);
  });
  let response = "";
  socket.setTimeout(10000);
  socket.on("data", (chunk) => { response += chunk; if (response.includes("\r\n\r\n")) { socket.destroy(); /^HTTP\/1\.1 (101|401|403) /.test(response) ? resolve() : reject(new Error(`unexpected WSS response: ${response.split("\r\n")[0]}`)); } });
  socket.on("timeout", () => reject(new Error("WSS probe timed out")));
  socket.on("error", reject);
});
console.log(JSON.stringify({ ok: true, host: target.hostname, trustedTls: true, websocketEndpoint: true }));
