'use strict';

const express = require('express');
const {
  requireOperationsFeature,
  requireOperationsRole,
  requireOperationsTrust,
} = require('../middlewares/operationsAuth');
const { createDonationService } = require('../operations/donationService');

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

function createOperationsDonationsRouter({ service } = {}) {
  const router = express.Router();
  let resolvedService = service;
  const getService = () => {
    if (!resolvedService) resolvedService = createDonationService();
    return resolvedService;
  };

  router.use(requireOperationsFeature('donationsAutomation'));

  router.get(
    '/',
    requireOperationsRole('admin', 'accountant', 'viewer'),
    requireOperationsTrust({ required: false, allowAll: true }),
    async (req, res) => {
      try {
        const result = await getService().listDonations({
          actor: actorFromRequest(req),
          trustId: req.operationsTrustId,
          status: req.query.status,
          limit: req.query.limit,
          offset: req.query.offset,
        });
        return res.json({ success: true, result: result || [] });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/offline',
    requireOperationsRole('admin', 'accountant'),
    requireOperationsTrust({ required: true, write: true }),
    async (req, res) => {
      try {
        const result = await getService().recordOfflineDonation({
          ...req.body,
          trustId: req.operationsTrustId,
          actor: actorFromRequest(req),
          request: req,
        });
        return res.status(201).json({ success: true, result });
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
        const result = await getService().getDonation({
          actor: actorFromRequest(req),
          id: req.params.id,
          trustId: req.operationsTrustId,
        });
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  return router;
}

const router = createOperationsDonationsRouter();
router.createOperationsDonationsRouter = createOperationsDonationsRouter;

module.exports = router;
