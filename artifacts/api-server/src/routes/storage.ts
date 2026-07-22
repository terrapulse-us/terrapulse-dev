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
      res.setHeader(
        "Content-Type",
        (metadata.contentType as string) || "application/octet-stream"
      );
      res.setHeader("Cache-Control", "public, max-age=3600");
      if (metadata.size) {
        res.setHeader("Content-Length", String(metadata.size));
      }

      file
        .createReadStream()
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
