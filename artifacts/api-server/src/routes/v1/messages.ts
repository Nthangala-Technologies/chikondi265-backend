import { Router } from "express";
import {
  ClearConnectionMessagesBody,
  ClearConnectionMessagesParams,
  ClearConnectionMessagesResponse,
  CreateConnectionMessageBody,
  DeleteConnectionMessageBody,
  DeleteConnectionMessageParams,
  DeleteConnectionMessageResponse,
  EditConnectionMessageBody,
  EditConnectionMessageParams,
  EditConnectionMessageResponse,
  GetConnectionMessagesAfterCursorParams,
  GetConnectionMessagesAfterCursorResponse,
  GetConnectionMessagesParams,
  GetConnectionMessagesResponse,
} from "@workspace/api-zod";
import { ApiError } from "../../middleware/error-handler";
import { requireUser } from "../../middleware/require-user";
import { publishConnectionMessage } from "../../modules/chat/realtime";
import {
  clearConnectionMessages,
  createConnectionMessage,
  deleteConnectionMessage,
  editConnectionMessage,
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

router.patch("/messages/:messageId", async (req, res, next): Promise<void> => {
  const parsedParams = EditConnectionMessageParams.safeParse(req.params);
  if (!parsedParams.success) {
    next(new ApiError(400, "BAD_REQUEST", "Message ID is invalid."));
    return;
  }
  const parsedBody = EditConnectionMessageBody.safeParse(req.body);
  if (!parsedBody.success || !parsedBody.data.body.trim()) {
    next(new ApiError(400, "BAD_REQUEST", "Message details are invalid."));
    return;
  }

  try {
    const message = await editConnectionMessage({
      userId: res.locals.userId as string,
      messageId: parsedParams.data.messageId,
      body: parsedBody.data.body,
    });
    res.json(EditConnectionMessageResponse.parse(message));
  } catch (error) {
    next(error);
  }
});

router.delete(
  "/messages/:messageId",
  async (req, res, next): Promise<void> => {
    const parsedParams = DeleteConnectionMessageParams.safeParse(req.params);
    if (!parsedParams.success) {
      next(new ApiError(400, "BAD_REQUEST", "Message ID is invalid."));
      return;
    }
    const parsedBody = DeleteConnectionMessageBody.safeParse(req.body);
    if (!parsedBody.success) {
      next(new ApiError(400, "BAD_REQUEST", "Deletion scope is invalid."));
      return;
    }

    try {
      const result = await deleteConnectionMessage({
        userId: res.locals.userId as string,
        messageId: parsedParams.data.messageId,
        scope: parsedBody.data.scope,
      });
      res.json(DeleteConnectionMessageResponse.parse(result));
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/connections/:id/messages",
  async (req, res, next): Promise<void> => {
    const parsedParams = ClearConnectionMessagesParams.safeParse(req.params);
    if (!parsedParams.success) {
      next(new ApiError(400, "BAD_REQUEST", "Connection ID is invalid."));
      return;
    }
    const parsedBody = ClearConnectionMessagesBody.safeParse(req.body);
    if (!parsedBody.success) {
      next(new ApiError(400, "BAD_REQUEST", "Deletion scope is invalid."));
      return;
    }

    try {
      const result = await clearConnectionMessages({
        userId: res.locals.userId as string,
        connectionId: parsedParams.data.id,
        scope: parsedBody.data.scope,
      });
      res.json(ClearConnectionMessagesResponse.parse(result));
    } catch (error) {
      next(error);
    }
  },
);

export default router;
