const { getRequestContext } = require('../context/requestContext');

// Default system timestamp fields to ignore during mutation diffing
const DEFAULT_IGNORED_FIELDS = new Set([
  'updatedat',
  'updated_at',
  'syslastmodifieddt',
  'sysmodifieddt',
  'createdat',
  'created_at',
  'sysenrollmentdt',
  'lastattemptat',
  'nextretryat',
]);

/**
 * Compare two values for functional equality handling Dates, Decimals, Objects, and Primitives
 */
const areValuesEqual = (val1, val2) => {
  if (val1 === val2) return true;

  if (val1 === null || val1 === undefined || val2 === null || val2 === undefined) {
    return val1 === val2;
  }

  // Handle Date comparison
  if (val1 instanceof Date && val2 instanceof Date) {
    return val1.getTime() === val2.getTime();
  }
  if (val1 instanceof Date || val2 instanceof Date) {
    const d1 = val1 instanceof Date ? val1 : new Date(val1);
    const d2 = val2 instanceof Date ? val2 : new Date(val2);
    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
      return d1.getTime() === d2.getTime();
    }
  }

  // Handle Prisma Decimal.js comparison
  if (typeof val1?.equals === 'function') {
    return val1.equals(val2);
  }
  if (typeof val2?.equals === 'function') {
    return val2.equals(val1);
  }
  if (
    typeof val1?.toString === 'function' &&
    typeof val2?.toString === 'function' &&
    (val1.constructor.name === 'Decimal' || val2.constructor.name === 'Decimal')
  ) {
    return val1.toString() === val2.toString();
  }

  // Handle Object & Array comparison
  if (typeof val1 === 'object' && typeof val2 === 'object') {
    try {
      return JSON.stringify(val1) === JSON.stringify(val2);
    } catch {
      return false;
    }
  }

  return false;
};

/**
 * Normalizes values for JSON serialization in audit logs
 */
const serializeValue = (val) => {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val?.toString === 'function' && val.constructor.name === 'Decimal') {
    return val.toString();
  }
  return val;
};

/**
 * Calculate field diffs between previous state and new state
 *
 * @param {Object} oldState - Object state before mutation
 * @param {Object} newState - Object state after mutation
 * @param {Object} options - Configuration options (e.g. ignoredFields)
 * @returns {{ changedfields: string[], oldvalues: Object, newvalues: Object }}
 */
const calculateDiff = (oldState = {}, newState = {}, options = {}) => {
  const ignoredFields = options.ignoredFields
    ? new Set([...DEFAULT_IGNORED_FIELDS, ...options.ignoredFields.map((f) => f.toLowerCase())])
    : DEFAULT_IGNORED_FIELDS;

  const oldObj = oldState || {};
  const newObj = newState || {};

  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const changedfields = [];
  const oldvalues = {};
  const newvalues = {};

  for (const key of allKeys) {
    if (ignoredFields.has(key.toLowerCase())) {
      continue;
    }

    const oldVal = oldObj[key];
    const newVal = newObj[key];

    if (!areValuesEqual(oldVal, newVal)) {
      changedfields.push(key);
      if (oldVal !== undefined) {
        oldvalues[key] = serializeValue(oldVal);
      }
      if (newVal !== undefined) {
        newvalues[key] = serializeValue(newVal);
      }
    }
  }

  return {
    changedfields,
    oldvalues,
    newvalues,
  };
};

/**
 * Record an audit log entry in the database
 *
 * @param {Object} prismaClient - Prisma client instance
 * @param {Object} auditData - Audit details
 * @returns {Promise<Object|null>}
 */
const recordAuditLog = async (prismaClient, auditData = {}) => {
  try {
    if (!prismaClient) {
      throw new Error('Prisma client is required to record audit log');
    }

    const ctx = getRequestContext();
    const entitytype = auditData.entitytype || auditData.entityType || auditData.entityname;
    const entityid = auditData.entityid || auditData.entityId;
    const action = auditData.action || 'UPDATE';
    const customerid = auditData.customerid || auditData.customerId || null;
    const oldervalue = auditData.oldervalue ?? auditData.oldValue ?? auditData.oldvalues ?? null;
    const newvalue = auditData.newvalue ?? auditData.newValue ?? auditData.newvalues ?? null;
    const createdby = auditData.createdby || auditData.createdBy || 'SYSTEM';
    const createdby_type = auditData.createdby_type || auditData.createdByType || 'AUTOMATED';

    const changedfields = auditData.changedfields || auditData.changedFields;
    const requestid = auditData.requestid || auditData.requestId || ctx.requestId || null;
    const actor = auditData.actor || ctx.actor || 'ANONYMOUS';
    const ipaddress = auditData.ipaddress || auditData.ipAddress || ctx.ipAddress || null;

    if (!entitytype || !entityid) {
      throw new Error('Both entitytype and entityid are required to record audit logging');
    }

    // Build metadata payload preserving custom metadata and context
    let metadata = auditData.metadata && typeof auditData.metadata === 'object' ? { ...auditData.metadata } : null;

    if (changedfields && Array.isArray(changedfields) && changedfields.length > 0) {
      metadata = metadata || {};
      if (!metadata.changedfields) metadata.changedfields = changedfields;
    }
    if (requestid) {
      metadata = metadata || {};
      if (!metadata.requestid) metadata.requestid = String(requestid);
    }
    if (actor && actor !== 'ANONYMOUS') {
      metadata = metadata || {};
      if (!metadata.actor) metadata.actor = String(actor);
    }
    if (ipaddress) {
      metadata = metadata || {};
      if (!metadata.ipaddress) metadata.ipaddress = String(ipaddress);
    }

    const normalizedEntityType = String(entitytype).toUpperCase();
    const logData = {
      entityname: normalizedEntityType,
      entityid: String(entityid),
      action: String(action).toUpperCase(),
      customerid: customerid ? String(customerid) : null,
      oldvalues: oldervalue !== null && oldervalue !== undefined ? oldervalue : null,
      newvalues: newvalue !== null && newvalue !== undefined ? newvalue : null,
      changedfields: changedfields && Array.isArray(changedfields) ? changedfields : null,
      metadata: metadata && Object.keys(metadata).length > 0 ? metadata : null,
      requestid: requestid ? String(requestid) : null,
      actor: actor ? String(actor) : 'ANONYMOUS',
      ipaddress: ipaddress ? String(ipaddress) : null,
      createdby: String(createdby),
      createdby_type: String(createdby_type).toUpperCase(),
      createdat: new Date(),
    };

    if (!prismaClient.auditlog?.create) {
      throw new Error('AuditLog Prisma model is not available');
    }

    const auditLog = await prismaClient.auditlog.create({ data: logData });
    console.info(`[AUDIT_SERVICE] Audit recorded successfully: ${logData.entityname} | ${logData.entityid} | ${logData.action}`);
    return {
      ...auditLog,
      auditlogid: auditLog.auditid,
    };
  } catch (error) {
    console.error('[AUDIT_SERVICE] Error writing audit log:', error.message);
    throw error;
  }
};

/**
 * Log audit entry for business compliance (non-throwing helper)
 *
 * @param {Object} params - Audit parameters
 * @returns {Promise<Object|null>}
 */
const createAuditEntry = async (params = {}) => {
  try {
    const entityType = params.entityType || params.entitytype || params.entityname;
    const entityId = params.entityId || params.entityid;
    const action = params.action;

    if (!entityType || !entityId || !action) {
      return null;
    }

    const prisma = require('../utils/db');
    return await recordAuditLog(prisma, params);
  } catch (error) {
    console.error('[AUDIT_SERVICE] Failed to create audit entry:', error.message);
    // Don't throw - audit failure should not break business logic
    return null;
  }
};

/**
 * Get audit trail for a specific entity ID
 */
const getAuditTrailByEntityId = async (entityId, prismaClient) => {
  try {
    const client = prismaClient?.auditlog ? prismaClient : require('../utils/db');
    return await client.auditlog.findMany({
      where: { entityid: String(entityId) },
      orderBy: { createdat: 'desc' },
    });
  } catch (error) {
    console.error('[AUDIT_SERVICE] Failed to fetch audit trail by entity ID:', error.message);
    throw error;
  }
};

/**
 * Get compliance audit trail for a customer (all entity types)
 */
const getCustomerAuditTrail = async (customerId, options = {}, prismaClient) => {
  const { from, to, entityType } = options;
  try {
    const client = prismaClient?.auditlog ? prismaClient : require('../utils/db');
    const whereClause = { customerid: customerId };

    if (entityType) {
      whereClause.OR = [
        { entitytype: String(entityType).toUpperCase() },
        { entityname: String(entityType).toUpperCase() },
      ];
    }

    if (from || to) {
      whereClause.createdat = {};
      if (from) whereClause.createdat.gte = new Date(from);
      if (to) whereClause.createdat.lte = new Date(to);
    }

    return await client.auditlog.findMany({
      where: whereClause,
      orderBy: { createdat: 'desc' },
    });
  } catch (error) {
    console.error('[AUDIT_SERVICE] Failed to fetch customer audit trail:', error.message);
    throw error;
  }
};

/**
 * Fetch audit logs by entity name/type and entity ID
 */
const getAuditLogsByEntity = async (prismaClient, entityname, entityid) => {
  try {
    const client = prismaClient?.auditlog ? prismaClient : require('../utils/db');
    if (!client?.auditlog) return [];
    return await client.auditlog.findMany({
      where: {
        OR: [
          { entitytype: String(entityname).toUpperCase() },
          { entityname: String(entityname).toUpperCase() },
        ],
        entityid: String(entityid),
      },
      orderBy: { createdat: 'desc' },
    });
  } catch (error) {
    console.error('[AUDIT_SERVICE] Error fetching audit logs by entity:', error.message);
    return [];
  }
};

/**
 * Fetch audit logs by Request ID (ordered chronologically for event flow)
 */
const getAuditLogsByRequestId = async (prismaClient, requestid) => {
  try {
    const client = prismaClient?.auditlog ? prismaClient : require('../utils/db');
    if (!client?.auditlog) return [];
    return await client.auditlog.findMany({
      where: {
        OR: [
          { requestid: String(requestid) },
          {
            metadata: {
              path: ['requestid'],
              equals: String(requestid),
            },
          },
        ],
      },
      orderBy: { createdat: 'asc' },
    });
  } catch (error) {
    console.error('[AUDIT_SERVICE] Error fetching audit logs by request ID:', error.message);
    return [];
  }
};

const getAuditLogs = async (prismaClient, page = 1, pageSize = 10, filters = {}) => {
  const safePage = Math.max(Number(page) || 1, 1);
  const safePageSize = Math.min(Math.max(Number(pageSize) || 10, 1), 10000);
  const where = {};
  const { entityname, action, search, startDate, endDate } = filters;

  if (entityname) {
    const normalizedEntity = entityname === 'PROMOTIONAL_DLQ'
      ? 'DLQ'
      : entityname.toUpperCase();

    where.OR = [
      { entityname: normalizedEntity },
      { entitytype: normalizedEntity },
    ];
  }

  if (action) {
    where.action = action.toUpperCase();
  }

   if (search) {
    where.AND = [{ OR: [
      { entityid: { contains: search, mode: 'insensitive' } },
      { customerid: { contains: search, mode: 'insensitive' } }
    ] }];
  }

  if (startDate || endDate) {
    where.createdat = {};

    if (startDate) {
      where.createdat.gte = new Date(`${startDate}T00:00:00.000Z`);
    }

    if (endDate) {
      where.createdat.lt = new Date(`${endDate}T00:00:00.000Z`);
      where.createdat.lt.setUTCDate(where.createdat.lt.getUTCDate() + 1);
    }
  }

  const skip = (safePage - 1) * safePageSize;

  const [data, total] = await Promise.all([
    prismaClient.auditlog.findMany({
      where,
      orderBy: { createdat: 'desc' },
      skip,
      take: safePageSize,
      select: {
        auditid: true,
        createdat: true,
        entityname: true,
        entitytype: true,
        entityid: true,
        action: true,
        actor: true,
        createdby: true,
        customerid: true,
      },
    }),
    prismaClient.auditlog.count({where}),
  ]);

  return {
    data,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.ceil(total / safePageSize),
    },
  };
};

const getAuditLogById = async (prismaClient, auditId) => {
  const client = prismaClient?.auditlog
    ? prismaClient
    : require('../utils/db');

  return client.auditlog.findUnique({
    where: { auditid: String(auditId) },
  });
};

const getAuditStats = async (prismaClient) => {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const [totalEvents, updatesToday, deletions] = await Promise.all([
    prismaClient.auditlog.count(),
    prismaClient.auditlog.count({
      where: {
        action: 'UPDATE',
        createdat: { gte: startOfToday },
      },
    }),
    prismaClient.auditlog.count({
      where: { action: 'DELETE' },
    }),
  ]);

  return {
    totalEvents,
    updatesToday,
    deletions,
  };
};

module.exports = {
  calculateDiff,
  recordAuditLog,
  createAuditEntry,
  getAuditTrailByEntityId,
  getCustomerAuditTrail,
  getAuditLogsByEntity,
  getAuditLogs,
  getAuditLogById,
  getAuditStats,
  getAuditLogsByRequestId,
  DEFAULT_IGNORED_FIELDS,
  areValuesEqual,
};
