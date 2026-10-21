'use strict';

const {
  OperationsServiceError,
  createSupabasePostingRepository,
  getActorId,
  getActorRole,
  requireActor,
} = require('./postingService');

function ensureRecordId(recordId, field = 'recordId') {
  if (typeof recordId !== 'string' || !recordId.trim()) {
    throw new OperationsServiceError(`${field} is required`, {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details: { [field]: `${field} is required` },
    });
  }
  return recordId.trim();
}

function ensureReason(reason) {
  if (typeof reason !== 'string' || !reason.trim()) {
    throw new OperationsServiceError('A rejection reason is required', {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details: { reason: 'reason is required' },
    });
  }
  if (reason.trim().length > 2_000) {
    throw new OperationsServiceError('Reason must be 2000 characters or fewer', {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details: { reason: 'reason is too long' },
    });
  }
  return reason.trim();
}

function requestContext(actor) {
  return {
    requestId: actor?.requestId || actor?.request_id || null,
    requestIp: actor?.requestIp || actor?.request_ip || actor?.ip || null,
  };
}

function wrapAdapterError(error, operation) {
  if (error instanceof OperationsServiceError) throw error;
  throw new OperationsServiceError(error?.message || `Failed to ${operation}`, {
    code: error?.code || 'DATABASE_ERROR',
    statusCode: error?.statusCode || (error?.code === '42501' ? 403 : 400),
    details: error,
  });
}

function createApprovalService({ repository, now = () => new Date() } = {}) {
  const adapter = repository || createSupabasePostingRepository();

  return {
    async listApprovals({ actor, trustId, status } = {}) {
      requireActor(actor, ['admin', 'accountant', 'viewer'], 'read approvals');
      try {
        return await adapter.listApprovals({
          actor,
          actorId: getActorId(actor),
          trustId: trustId || null,
          status: status || null,
          now: now(),
        });
      } catch (error) {
        return wrapAdapterError(error, 'list approvals');
      }
    },

    async submitForApproval({ actor, recordId }) {
      requireActor(actor, ['admin', 'accountant'], 'submit records for approval');
      const normalizedRecordId = ensureRecordId(recordId);
      try {
        return await adapter.submitForApproval({
          actor,
          actorId: getActorId(actor),
          recordId: normalizedRecordId,
          context: requestContext(actor),
          now: now(),
        });
      } catch (error) {
        return wrapAdapterError(error, 'submit record for approval');
      }
    },

    async approveAndPost({ actor, approvalId }) {
      requireActor(actor, ['admin'], 'approve and post records');
      const normalizedApprovalId = ensureRecordId(approvalId, 'approvalId');
      try {
        return await adapter.approveAndPost({
          actor,
          actorId: getActorId(actor),
          approvalId: normalizedApprovalId,
          context: requestContext(actor),
          now: now(),
        });
      } catch (error) {
        return wrapAdapterError(error, 'approve and post record');
      }
    },

    async rejectApproval({ actor, approvalId, reason }) {
      requireActor(actor, ['admin'], 'reject approvals');
      const normalizedApprovalId = ensureRecordId(approvalId, 'approvalId');
      const normalizedReason = ensureReason(reason);
      try {
        return await adapter.rejectApproval({
          actor,
          actorId: getActorId(actor),
          approvalId: normalizedApprovalId,
          reason: normalizedReason,
          context: requestContext(actor),
          now: now(),
        });
      } catch (error) {
        return wrapAdapterError(error, 'reject approval');
      }
    },

    async reversePostedRecord({ actor, recordId, reason }) {
      requireActor(actor, ['admin'], 'reverse posted records');
      const normalizedRecordId = ensureRecordId(recordId);
      const normalizedReason = ensureReason(reason);
      try {
        return await adapter.reversePostedRecord({
          actor,
          actorId: getActorId(actor),
          recordId: normalizedRecordId,
          reason: normalizedReason,
          context: requestContext(actor),
          now: now(),
        });
      } catch (error) {
        return wrapAdapterError(error, 'reverse posted record');
      }
    },
  };
}

let defaultService;
function getDefaultService() {
  if (!defaultService) defaultService = createApprovalService();
  return defaultService;
}

module.exports = {
  createApprovalService,
  submitForApproval: (input) => getDefaultService().submitForApproval(input),
  approveAndPost: (input) => getDefaultService().approveAndPost(input),
  rejectApproval: (input) => getDefaultService().rejectApproval(input),
  reversePostedRecord: (input) => getDefaultService().reversePostedRecord(input),
  getActorRole,
};
