'use strict';

const { validateFinancialDraft } = require('./validation');

class OperationsServiceError extends Error {
  constructor(message, { code = 'OPERATIONS_ERROR', statusCode = 400, details } = {}) {
    super(message);
    this.name = 'OperationsServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function getActorId(actor) {
  return actor?.id || actor?.userId || actor?.user_id || null;
}

function getActorRole(actor) {
  return actor?.role || actor?.profile?.role || null;
}

function requireActor(actor, allowedRoles, action) {
  if (!getActorId(actor)) {
    throw new OperationsServiceError('Authenticated actor is required', {
      code: 'UNAUTHENTICATED',
      statusCode: 401,
    });
  }
  if (!allowedRoles.includes(getActorRole(actor))) {
    throw new OperationsServiceError(`Actor is not allowed to ${action}`, {
      code: 'FORBIDDEN',
      statusCode: 403,
    });
  }
}

function requestContext(actor) {
  return {
    requestId: actor?.requestId || actor?.request_id || null,
    requestIp: actor?.requestIp || actor?.request_ip || actor?.ip || null,
  };
}

function databaseError(error, operation) {
  const message = error?.message || `Failed to ${operation}`;
  const code = error?.code || error?.details?.code || 'DATABASE_ERROR';
  const statusCode = error?.statusCode || (
    code === 'PGRST116' ? 404 : code === '42501' ? 403 : 400
  );
  return new OperationsServiceError(message, { code, statusCode, details: error });
}

function requireResult(data, operation) {
  if (data === undefined || data === null) {
    throw new OperationsServiceError(`Database did not return a result for ${operation}`, {
      code: 'EMPTY_DATABASE_RESULT',
      statusCode: 502,
    });
  }
  return data;
}

function createSupabasePostingRepository(client) {
  const supabase = client || require('../config/supabaseAdmin');

  async function rpc(functionName, params, operation) {
    const { data, error } = await supabase.rpc(functionName, params);
    if (error) throw databaseError(error, operation);
    return requireResult(data, operation);
  }

  return {
    async createDraft({ actorId, draft, context }) {
      return rpc('operations_create_draft', {
        p_actor_id: actorId,
        p_trust_id: draft.trustId,
        p_type: draft.type,
        p_amount: draft.amount,
        p_currency: draft.currency,
        p_account_id: draft.accountId,
        p_fund_id: draft.fundId,
        p_party_id: draft.partyId,
        p_source: draft.source,
        p_metadata: draft.metadata,
        p_request_id: context.requestId,
        p_request_ip: context.requestIp,
      }, 'create financial draft');
    },

    async submitForApproval({ actorId, recordId, context }) {
      return rpc('operations_submit_for_approval', {
        p_actor_id: actorId,
        p_record_id: recordId,
        p_request_id: context.requestId,
        p_request_ip: context.requestIp,
      }, 'submit record for approval');
    },

    async approveAndPost({ actorId, approvalId, context }) {
      return rpc('operations_approve_and_post', {
        p_actor_id: actorId,
        p_approval_id: approvalId,
        p_request_id: context.requestId,
        p_request_ip: context.requestIp,
      }, 'approve and post record');
    },

    async rejectApproval({ actorId, approvalId, reason, context }) {
      return rpc('operations_reject_approval', {
        p_actor_id: actorId,
        p_approval_id: approvalId,
        p_reason: reason,
        p_request_id: context.requestId,
        p_request_ip: context.requestIp,
      }, 'reject approval');
    },

    async reversePostedRecord({ actorId, recordId, reason, context }) {
      return rpc('operations_reverse_posted_record', {
        p_actor_id: actorId,
        p_record_id: recordId,
        p_reason: reason,
        p_request_id: context.requestId,
        p_request_ip: context.requestIp,
      }, 'reverse posted record');
    },

    async listApprovals({ trustId, status }) {
      let query = supabase
        .from('operations_approval_requests')
        .select('*')
        .order('requested_at', { ascending: false });
      if (trustId) query = query.eq('trust_id', trustId);
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw databaseError(error, 'list approvals');
      return data || [];
    },
  };
}

function createPostingService({ repository, now = () => new Date() } = {}) {
  const adapter = repository || createSupabasePostingRepository();

  return {
    async createDraft({ actor, trustId, type, amount, currency, accountId, fundId, partyId, source, metadata }) {
      requireActor(actor, ['admin', 'accountant'], 'create financial records');
      const validation = validateFinancialDraft({
        trustId,
        type,
        amount,
        currency,
        accountId,
        fundId,
        partyId,
        source,
        metadata,
      });
      if (!validation.valid) {
        throw new OperationsServiceError('Financial draft validation failed', {
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: validation.errors,
        });
      }

      const result = await adapter.createDraft({
        actor,
        actorId: getActorId(actor),
        draft: validation.value,
        context: requestContext(actor),
        now: now(),
      }).catch((error) => {
        if (error instanceof OperationsServiceError) throw error;
        throw databaseError(error, 'create financial draft');
      });

      const recordId = result?.id || result?.transactionId || result?.transaction_id || result;
      if (!recordId || typeof recordId !== 'string') {
        throw new OperationsServiceError('Database did not return a draft transaction ID', {
          code: 'EMPTY_DATABASE_RESULT',
          statusCode: 502,
        });
      }
      return recordId;
    },

    async approveAndPost({ actor, approvalId }) {
      requireActor(actor, ['admin'], 'approve and post records');
      return adapter.approveAndPost({
        actor,
        actorId: getActorId(actor),
        approvalId,
        context: requestContext(actor),
        now: now(),
      }).catch((error) => {
        if (error instanceof OperationsServiceError) throw error;
        throw databaseError(error, 'approve and post record');
      });
    },

    async reversePostedRecord({ actor, recordId, reason }) {
      requireActor(actor, ['admin'], 'reverse posted records');
      if (typeof reason !== 'string' || !reason.trim()) {
        throw new OperationsServiceError('A reversal reason is required', {
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: { reason: 'reason is required' },
        });
      }
      return adapter.reversePostedRecord({
        actor,
        actorId: getActorId(actor),
        recordId,
        reason: reason.trim(),
        context: requestContext(actor),
        now: now(),
      }).catch((error) => {
        if (error instanceof OperationsServiceError) throw error;
        throw databaseError(error, 'reverse posted record');
      });
    },
  };
}

let defaultService;
function getDefaultService() {
  if (!defaultService) defaultService = createPostingService();
  return defaultService;
}

module.exports = {
  OperationsServiceError,
  createPostingService,
  createSupabasePostingRepository,
  getActorId,
  getActorRole,
  requireActor,
  createDraft: (input) => getDefaultService().createDraft(input),
  approveAndPost: (input) => getDefaultService().approveAndPost(input),
  reversePostedRecord: (input) => getDefaultService().reversePostedRecord(input),
};
