'use strict';

const express = require('express');
const {
  requireOperationsFeature,
  requireOperationsRole,
  requireOperationsTrust,
} = require('../middlewares/operationsAuth');
const { createPayrollService } = require('../operations/payrollService');

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
    message: error?.message || 'Operations payroll request failed',
  };
  if (error?.details && typeof error.details === 'object') body.errors = error.details;
  return res.status(statusCode).json(body);
}

function createOperationsPayrollRouter({ service } = {}) {
  const router = express.Router();
  let resolvedService = service;
  const getService = () => {
    if (!resolvedService) resolvedService = createPayrollService();
    return resolvedService;
  };

  router.use(requireOperationsFeature('payroll'));

  router.get(
    '/employees',
    requireOperationsRole('admin', 'accountant', 'viewer'),
    requireOperationsTrust({ required: false, allowAll: true }),
    async (req, res) => {
      try {
        const result = await getService().listEmployees({ actor: actorFromRequest(req), trustId: req.operationsTrustId });
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/employees',
    requireOperationsRole('admin', 'accountant'),
    requireOperationsTrust({ required: true, write: true }),
    async (req, res) => {
      try {
        const result = await getService().createEmployee({
          actor: actorFromRequest(req),
          trustId: req.operationsTrustId,
          personId: req.body?.personId || req.body?.person_id,
          employeeCode: req.body?.employeeCode || req.body?.employee_code,
          startDate: req.body?.startDate || req.body?.start_date,
        });
        return res.status(201).json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.patch(
    '/employees/:id',
    requireOperationsRole('admin', 'accountant'),
    requireOperationsTrust({ required: true, sources: ['query', 'header', 'body'], write: true }),
    async (req, res) => {
      try {
        const result = await getService().updateEmployee({
          actor: actorFromRequest(req),
          employeeId: req.params.id,
          trustId: req.operationsTrustId,
          status: req.body?.status,
          endDate: req.body?.endDate || req.body?.end_date,
        });
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/salary-structures',
    requireOperationsRole('admin', 'accountant'),
    requireOperationsTrust({ required: true, sources: ['query', 'header', 'body'], write: true }),
    async (req, res) => {
      try {
        const result = await getService().saveSalaryStructure({
          actor: actorFromRequest(req),
          employeeId: req.body?.employeeId || req.body?.employee_id,
          trustId: req.operationsTrustId,
          components: req.body?.components,
          effectiveFrom: req.body?.effectiveFrom || req.body?.effective_from,
        });
        return res.status(201).json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.get(
    '/runs',
    requireOperationsRole('admin', 'accountant', 'viewer'),
    requireOperationsTrust({ required: false, allowAll: true }),
    async (req, res) => {
      try {
        const result = await getService().listPayrollRuns({ actor: actorFromRequest(req), trustId: req.operationsTrustId });
        return res.json({ success: true, result: result || [] });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/runs',
    requireOperationsRole('admin', 'accountant'),
    requireOperationsTrust({ required: true, sources: ['query', 'header', 'body'], write: true }),
    async (req, res) => {
      try {
        const result = await getService().preparePayrollRun({
          actor: actorFromRequest(req),
          trustId: req.operationsTrustId,
          period: req.body?.period,
          employeeIds: req.body?.employeeIds || req.body?.employee_ids,
          fundId: req.body?.fundId || req.body?.fund_id,
        });
        return res.status(201).json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/runs/:id/approve',
    requireOperationsRole('admin'),
    requireOperationsTrust({ required: true, sources: ['query', 'header', 'body'], write: true }),
    async (req, res) => {
      try {
        const result = await getService().approvePayrollRun({ actor: actorFromRequest(req), payrollRunId: req.params.id, trustId: req.operationsTrustId });
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.post(
    '/runs/:id/payment',
    requireOperationsRole('admin', 'accountant'),
    requireOperationsTrust({ required: true, sources: ['query', 'header', 'body'], write: true }),
    async (req, res) => {
      try {
        const result = await getService().recordPayrollPayment({
          actor: actorFromRequest(req),
          payrollRunId: req.params.id,
          trustId: req.operationsTrustId,
          paymentReference: req.body?.paymentReference || req.body?.payment_reference,
        });
        return res.json({ success: true, result });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  router.get(
    '/runs/:id/payslips',
    requireOperationsRole('admin', 'accountant', 'viewer'),
    requireOperationsTrust({ required: true, sources: ['query', 'header'] }),
    async (req, res) => {
      try {
        const result = await getService().listPayslips({ actor: actorFromRequest(req), payrollRunId: req.params.id, trustId: req.operationsTrustId });
        return res.json({ success: true, result: result || [] });
      } catch (error) {
        return sendServiceError(res, error);
      }
    },
  );

  return router;
}

const router = createOperationsPayrollRouter();
router.createOperationsPayrollRouter = createOperationsPayrollRouter;

module.exports = router;
