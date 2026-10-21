'use strict';

const express = require('express');
const {
  requireOperationsFeature,
  requireOperationsRole,
  requireOperationsTrust,
} = require('../middlewares/operationsAuth');
const { createInvoiceService } = require('../operations/invoiceService');

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
    message: error?.message || 'Operations invoice request failed',
  };
  if (error?.details && typeof error.details === 'object') body.errors = error.details;
  return res.status(statusCode).json(body);
}

function createOperationsInvoicesRouter({ service } = {}) {
  const router = express.Router();
  let resolvedService = service;
  const getService = () => {
    if (!resolvedService) resolvedService = createInvoiceService();
    return resolvedService;
  };

  router.use(requireOperationsFeature('invoices'));

  router.get(
    '/',
    requireOperationsRole('admin', 'accountant', 'viewer'),
    requireOperationsTrust({ required: false, allowAll: true }),
    async (req, res) => {
      try {
        const result = await getService().listInvoices({
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
    '/',
    requireOperationsRole('admin', 'accountant'),
    requireOperationsTrust({ required: true, write: true }),
    async (req, res) => {
      try {
        const result = await getService().createInvoiceDraft({
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
    '/:id',
    requireOperationsRole('admin', 'accountant', 'viewer'),
    requireOperationsTrust({ required: true, sources: ['query', 'header'] }),
    async (req, res) => {
      try {
        const result = await getService().getInvoice({
          actor: actorFromRequest(req),
          invoiceId: req.params.id,
        });
        if (result.trust_id && result.trust_id !== req.operationsTrustId) {
          return res.status(404).json({ success: false, message: 'Not found' });
        }
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/:id/submit',
    requireOperationsRole('admin', 'accountant'),
    requireOperationsTrust({ required: true, sources: ['query', 'header', 'body'], write: true }),
    async (req, res) => {
      try {
        const result = await getService().submitInvoiceForApproval({
          actor: actorFromRequest(req),
          invoiceId: req.params.id,
        });
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/:id/approve',
    requireOperationsRole('admin'),
    requireOperationsTrust({ required: true, sources: ['query', 'header', 'body'], write: true }),
    async (req, res) => {
      try {
        const result = await getService().approveAndSendInvoice({
          actor: actorFromRequest(req),
          invoiceId: req.params.id,
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
    requireOperationsTrust({ required: true, sources: ['query', 'header', 'body'], write: true }),
    async (req, res) => {
      try {
        const result = await getService().rejectInvoiceApproval({
          actor: actorFromRequest(req),
          invoiceId: req.params.id,
          reason: req.body?.reason,
        });
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/:id/payment',
    requireOperationsRole('admin', 'accountant'),
    requireOperationsTrust({ required: true, sources: ['query', 'header', 'body'], write: true }),
    async (req, res) => {
      try {
        const result = await getService().recordInvoicePayment({
          actor: actorFromRequest(req),
          invoiceId: req.params.id,
          amount: req.body?.amount,
          paymentReference: req.body?.paymentReference || req.body?.payment_reference,
        });
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/:id/cancel-and-reissue',
    requireOperationsRole('admin'),
    requireOperationsTrust({ required: true, sources: ['query', 'header', 'body'], write: true }),
    async (req, res) => {
      try {
        const result = await getService().cancelAndReissueInvoice({
          actor: actorFromRequest(req),
          invoiceId: req.params.id,
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

const router = createOperationsInvoicesRouter();
router.createOperationsInvoicesRouter = createOperationsInvoicesRouter;

module.exports = router;
