import { Router } from "express";
import { env } from "../config/env.js";
import { getHealth } from "../controllers/health.controller.js";
import { healthRouter } from "./health.routes.js";

export const routes = Router();

routes.get("/health", getHealth);
routes.use(`/api/${env.API_VERSION}/health`, healthRouter);
