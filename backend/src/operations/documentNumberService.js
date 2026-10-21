'use strict';

function requiredText(value, field) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new TypeError(`${field} is required`);
  }
  return String(value).trim();
}

function validateDocumentType(value) {
  const documentType = requiredText(value, 'documentType').toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,31}$/.test(documentType)) {
    throw new TypeError('documentType must be a lowercase identifier');
  }
  return documentType;
}

function validateFinancialYear(value) {
  const financialYear = requiredText(value, 'financialYear');
  if (!/^\d{4}(?:-\d{2,4})?$/.test(financialYear)) {
    throw new TypeError('financialYear must use YYYY or YYYY-YY format');
  }
  return financialYear;
}

function createSupabaseNumberRepository(client) {
  const getClient = () => client || require('../config/supabaseAdmin');

  return {
    async nextNumber({ trustId, documentType, financialYear }) {
      const { data, error } = await getClient().rpc('operations_next_number', {
        p_trust_id: trustId,
        p_document_type: documentType,
        p_financial_year: financialYear,
      });
      if (error) throw error;
      return data;
    },
  };
}

function createDocumentNumberService({ numberRepository, client } = {}) {
  const repository = numberRepository || createSupabaseNumberRepository(client);

  async function allocate({ trustId, documentType, financialYear } = {}) {
    const normalizedTrustId = requiredText(trustId, 'trustId');
    const normalizedDocumentType = validateDocumentType(documentType);
    const normalizedFinancialYear = validateFinancialYear(financialYear);
    const allocateNumber = repository.nextNumber || repository.nextDocumentNumber || repository.allocate;
    if (typeof allocateNumber !== 'function') {
      throw new TypeError('numberRepository must provide nextNumber({ trustId, documentType, financialYear })');
    }

    // Atomicity belongs to operations_next_number (or the injected repository).
    // This service deliberately keeps no process-local sequence state.
    const value = await allocateNumber.call(repository, {
      trustId: normalizedTrustId,
      documentType: normalizedDocumentType,
      financialYear: normalizedFinancialYear,
    });
    const number = typeof value === 'object' && value !== null
      ? (value.number || value.documentNumber || value.value)
      : value;
    if (typeof number !== 'string' || number.trim() === '') {
      throw new Error('Document number repository returned an invalid number');
    }
    return number.trim();
  }

  return { nextDocumentNumber: allocate };
}

let defaultService;
function getDefaultService() {
  if (!defaultService) defaultService = createDocumentNumberService();
  return defaultService;
}

async function nextDocumentNumber(input) {
  const numberRepository = input?.numberRepository || input?.repository;
  const service = numberRepository || input?.client
    ? createDocumentNumberService({ numberRepository, client: input.client })
    : getDefaultService();
  return service.nextDocumentNumber(input);
}

module.exports = {
  createDocumentNumberService,
  createSupabaseNumberRepository,
  nextDocumentNumber,
};
