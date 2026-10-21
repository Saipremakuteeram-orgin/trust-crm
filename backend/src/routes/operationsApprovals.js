'use strict';

const express = require('express');
const {
  requireOperationsFeature,
  requireOperationsRole,
  requireOperationsTrust,
} = require('../middlewares/operationsAuth');
const { createApprovalService } = require('../operations/approvalService');

function actorFromRequest(req) {
  return {
    id: req.user?.id,
    role: req.profile?.role,
    email: req.user?.email,
    requestId: typeof req.get === 'function' ? req.get('x-request-id') : req.headers?.['x-request-id'],
    requestIp: req.ip,
  };
}

function sendServiceError(res, error) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const body = {
    success: false,
    message: error?.message || 'Operations request failed',
  };
  if (error?.details && typeof error.details === 'object') body.errors = error.details;
  return res.status(statusCode).json(body);
}

function createOperationsApprovalsRouter({ service } = {}) {
  const router = express.Router();
  let resolvedService = service;
  const getService = () => {
    if (!resolvedService) resolvedService = createApprovalService();
    return resolvedService;
  };

  router.use(requireOperationsFeature('approvals'));

  router.get(
    '/',
    requireOperationsTrust({ required: false, allowAll: true }),
    async (req, res) => {
      try {
        const result = await getService().listApprovals({
          actor: actorFromRequest(req),
          trustId: req.operationsTrustId,
          status: req.query.status,
        });
        return res.json({ success: true, result: result || [] });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/:id/submit',
    requireOperationsRole('admin', 'accountant'),
    requireOperationsTrust({ required: false, allowAll: true, write: true }),
    async (req, res) => {
      try {
        const result = await getService().submitForApproval({
          actor: actorFromRequest(req),
          recordId: req.params.id,
        });
        return res.status(201).json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/:id/approve',
    requireOperationsRole('admin'),
    requireOperationsTrust({ required: false, allowAll: true, write: true }),
    async (req, res) => {
      try {
        const result = await getService().approveAndPost({
          actor: actorFromRequest(req),
          approvalId: req.params.id,
        });
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/:id/reject',
    requireOperationsRole('admin'),
    requireOperationsTrust({ required: false, allowAll: true, write: true }),
    async (req, res) => {
      try {
        const result = await getService().rejectApproval({
          actor: actorFromRequest(req),
          approvalId: req.params.id,
          reason: req.body?.reason,
        });
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/records/:id/reverse',
    requireOperationsRole('admin'),
    requireOperationsTrust({ required: false, allowAll: true, write: true }),
    async (req, res) => {
      try {
        const result = await getService().reversePostedRecord({
          actor: actorFromRequest(req),
          recordId: req.params.id,
          reason: req.body?.reason,
        });
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  return router;
}

const router = createOperationsApprovalsRouter();
router.createOperationsApprovalsRouter = createOperationsApprovalsRouter;

module.exports = router;
