import { Router } from "express";
import {
  CreateConnectionMessageBody,
  GetConnectionMessagesAfterCursorParams,
  GetConnectionMessagesAfterCursorResponse,
  GetConnectionMessagesParams,
  GetConnectionMessagesResponse,
} from "@workspace/api-zod";
import { ApiError } from "../../middleware/error-handler";
import { requireUser } from "../../middleware/require-user";
import { publishConnectionMessage } from "../../modules/chat/realtime";
import {
  createConnectionMessage,
  getConnectionMessagePage,
} from "../../modules/chat/service";

const router = Router();

router.use(requireUser);

router.get(
  "/connections/:id/messages/page/:cursor",
  async (req, res, next): Promise<void> => {
    const parsed = GetConnectionMessagesAfterCursorParams.safeParse({
      id: req.params.id,
      cursor: req.params.cursor,
    });
    if (!parsed.success) {
      next(new ApiError(400, "BAD_REQUEST", "Message cursor is invalid."));
      return;
    }

    try {
      const page = await getConnectionMessagePage(
        res.locals.userId as string,
        parsed.data.id,
        parsed.data.cursor,
      );
      res.json(GetConnectionMessagesAfterCursorResponse.parse(page));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/connections/:id/messages",
  async (req, res, next): Promise<void> => {
    const parsed = GetConnectionMessagesParams.safeParse(req.params);
    if (!parsed.success) {
      next(new ApiError(400, "BAD_REQUEST", "Connection ID is invalid."));
      return;
    }

    try {
      const page = await getConnectionMessagePage(
        res.locals.userId as string,
        parsed.data.id,
      );
      res.json(GetConnectionMessagesResponse.parse(page));
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/connections/:id/messages",
  async (req, res, next): Promise<void> => {
    const parsedParams = GetConnectionMessagesParams.safeParse(req.params);
    if (!parsedParams.success) {
      next(new ApiError(400, "BAD_REQUEST", "Connection ID is invalid."));
      return;
    }

    const parsedBody = CreateConnectionMessageBody.safeParse(req.body);
    if (!parsedBody.success || !parsedBody.data.body.trim()) {
      next(new ApiError(400, "BAD_REQUEST", "Message details are invalid."));
      return;
    }

    try {
      const result = await createConnectionMessage({
        userId: res.locals.userId as string,
        connectionId: parsedParams.data.id,
        clientMessageId: parsedBody.data.clientMessageId,
        body: parsedBody.data.body,
      });
      if (result.created) {
        publishConnectionMessage(parsedParams.data.id, result.message);
      }
      res
        .status(result.created ? 201 : 200)
        .json(result.message);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
