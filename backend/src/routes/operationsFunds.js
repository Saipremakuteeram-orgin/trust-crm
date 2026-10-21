'use strict';

const express = require('express');
const {
  requireOperationsFeature,
  requireOperationsRole,
  requireOperationsTrust,
} = require('../middlewares/operationsAuth');
const { createFundService } = require('../operations/fundService');

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
    message: error?.message || 'Operations fund request failed',
  };
  if (error?.details && typeof error.details === 'object') body.errors = error.details;
  return res.status(statusCode).json(body);
}

function createOperationsFundsRouter({ service } = {}) {
  const router = express.Router();
  let resolvedService = service;
  const getService = () => {
    if (!resolvedService) resolvedService = createFundService();
    return resolvedService;
  };

  router.use(requireOperationsFeature('funds'));

  router.get(
    '/',
    requireOperationsRole('admin', 'accountant', 'viewer'),
    requireOperationsTrust({ required: false, allowAll: true }),
    async (req, res) => {
      try {
        const result = await getService().listFunds({
          actor: actorFromRequest(req),
          trustId: req.operationsTrustId,
        });
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/',
    requireOperationsRole('admin', 'accountant'),
    requireOperationsTrust({ required: true, write: true }),
    async (req, res) => {
      try {
        const result = await getService().createFund({
          ...req.body,
          trustId: req.operationsTrustId,
          actor: actorFromRequest(req),
        });
        return res.status(201).json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.get(
    '/:id/summary',
    requireOperationsRole('admin', 'accountant', 'viewer'),
    requireOperationsTrust({ required: true, sources: ['query', 'header'] }),
    async (req, res) => {
      try {
        const result = await getService().getFundSummary({
          actor: actorFromRequest(req),
          trustId: req.operationsTrustId,
          fundId: req.params.id,
          dateRange: { from: req.query.from, to: req.query.to },
        });
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.get(
    '/:id',
    requireOperationsRole('admin', 'accountant', 'viewer'),
    requireOperationsTrust({ required: true, sources: ['query', 'header'] }),
    async (req, res) => {
      try {
        const result = await getService().getFund({
          actor: actorFromRequest(req),
          fundId: req.params.id,
          trustId: req.operationsTrustId,
        });
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/:id/transfer',
    requireOperationsRole('admin', 'accountant'),
    requireOperationsTrust({ required: true, write: true }),
    async (req, res) => {
      try {
        const result = await getService().createFundTransfer({
          actor: actorFromRequest(req),
          fromFundId: req.params.id,
          toFundId: req.body?.toFundId || req.body?.to_fund_id,
          amount: req.body?.amount,
          reason: req.body?.reason,
          overrideReason: req.body?.overrideReason || req.body?.override_reason,
        });
        return res.status(201).json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  // Fund-specific approvals remain on the same operations approval boundary,
  // while the existing transaction approval routes remain unchanged.
  router.post(
    '/:id/approve',
    requireOperationsRole('admin'),
    requireOperationsTrust({ required: true, write: true, sources: ['query', 'header'] }),
    async (req, res) => {
      try {
        const result = await getService().approveFund({
          actor: actorFromRequest(req),
          fundId: req.params.id,
          approvalId: req.body?.approvalId || req.body?.approval_id,
        });
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/:id/transfers/:transferId/approve',
    requireOperationsRole('admin'),
    requireOperationsTrust({ required: true, write: true, sources: ['query', 'header'] }),
    async (req, res) => {
      try {
        const result = await getService().approveFundTransfer({
          actor: actorFromRequest(req),
          transferId: req.params.transferId,
          overrideReason: req.body?.overrideReason || req.body?.override_reason,
        });
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  return router;
}

const router = createOperationsFundsRouter();
router.createOperationsFundsRouter = createOperationsFundsRouter;

module.exports = router;
