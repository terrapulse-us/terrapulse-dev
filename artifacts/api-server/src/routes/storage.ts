import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets (offline region archives, glyphs, sprites) from
 * PUBLIC_OBJECT_SEARCH_PATHS. Unconditionally public — no auth or ACL checks.
 */
router.get(
  "/storage/public-objects/*filePath",
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join("/") : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const [metadata] = await file.getMetadata();
      const totalSize = Number(metadata.size ?? 0);
      res.setHeader(
        "Content-Type",
        (metadata.contentType as string) || "application/octet-stream"
      );
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Accept-Ranges", "bytes");

      // Range support (single "bytes=start-end" ranges only) so large region
      // archives can be downloaded in resumable chunks. Long single-shot
      // responses get reset by proxies/mobile networks; ranged chunks don't.
      const rangeHeader = req.headers.range;
      const rangeMatch =
        totalSize > 0 && typeof rangeHeader === "string"
          ? /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim())
          : null;
      let start = 0;
      let end = totalSize - 1;
      if (rangeMatch) {
        start = Number(rangeMatch[1]);
        end = rangeMatch[2] ? Math.min(Number(rangeMatch[2]), totalSize - 1) : totalSize - 1;
        if (start >= totalSize || start > end) {
          res.status(416).setHeader("Content-Range", `bytes */${totalSize}`).end();
          return;
        }
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
        res.setHeader("Content-Length", String(end - start + 1));
      } else if (totalSize > 0) {
        res.setHeader("Content-Length", String(totalSize));
      }

      file
        .createReadStream(rangeMatch ? { start, end } : undefined)
        .on("error", (err) => {
          req.log.error({ err }, "Error streaming public object");
          if (!res.headersSent) {
            res.status(500).json({ error: "Failed to serve public object" });
          } else {
            res.destroy();
          }
        })
        .pipe(res);
    } catch (error) {
      req.log.error({ err: error }, "Error serving public object");
      res.status(500).json({ error: "Failed to serve public object" });
    }
  }
);

export default router;
