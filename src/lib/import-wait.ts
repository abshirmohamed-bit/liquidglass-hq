export async function waitForImportedSource(
  read: () => Promise<{ status: string; error: string | null }>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 720,
) {
  for (let i = 0; i < attempts; i++) {
    const source = await read();
    if (source.status === "READY") return;
    if (source.status === "FAILED") throw new Error(source.error || "Video import failed.");
    await sleep(5000);
  }
  throw new Error("The video is still importing. Check its progress in the Library before starting clips.");
}