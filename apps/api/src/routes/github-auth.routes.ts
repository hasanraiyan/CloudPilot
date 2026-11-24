import { Router } from "express";
import {
  githubCallback,
  githubLogout,
  githubMe,
  githubStart,
} from "../controllers/github-auth.controller.js";
import { requireAuth, requireCsrf } from "../middlewares/auth.middleware.js";

export const githubAuthRouter = Router();

githubAuthRouter.get("/start", githubStart);
githubAuthRouter.get("/callback", githubCallback);
githubAuthRouter.get("/me", githubMe);
githubAuthRouter.post("/logout", requireAuth, requireCsrf, githubLogout);
