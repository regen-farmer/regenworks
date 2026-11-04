// The app-wide JSON body parser (100 kB), skipped for routes that parse their own larger
// bodies after their role check (Model sites: outlines and import files).
import bodyParser from "body-parser";
import type express from "express";

const OWN_PARSERS = ["/internal/model-sites"];

export function defaultJson(): express.RequestHandler {
  const json = bodyParser.json();
  return (req, res, next) => (OWN_PARSERS.some((p) => req.path.startsWith(p)) ? next() : json(req, res, next));
}
