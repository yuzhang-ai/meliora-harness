import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// Node/undici rejects the Fetch Standard's blocked ports with `bad port`.
// Windows may allocate one of them for `listen(0)`, so fixture listeners retry
// before returning a URL that a test is expected to fetch.
const fetchForbiddenPorts = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540,
  548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049,
  3659, 4045, 4190, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

export const listenOnFetchSafeLoopbackPort = async (server: Server): Promise<number> => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = (): void => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(0, "127.0.0.1");
    });
    const port = (server.address() as AddressInfo).port;
    if (!fetchForbiddenPorts.has(port)) return port;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  throw new Error("could_not_allocate_fetch_safe_loopback_port");
};
