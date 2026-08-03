import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation error", details: err.flatten() });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Not found" });
    }
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Conflict: duplicate value" });
    }
    if (err.code === "P2003") {
      return res.status(400).json({ error: "Invalid reference: related record does not exist" });
    }
    if (err.code === "P2034") {
      return res.status(409).json({ error: "Conflict: concurrent update, please retry" });
    }
  }
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}
