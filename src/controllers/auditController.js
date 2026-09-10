const prisma = require('../db/prisma');
const {
  getAuditLogs,
  getAuditStats,
  getAuditLogById: findAuditLogById,
  getAuditLogsByRequestId: findAuditLogsByRequestId,
} = require('../services/auditService');

const listAuditLogs = async (req, res, next) => {
  try {
    const result = await getAuditLogs(
      prisma,
      req.query.page,
      req.query.pageSize,
      {
         entityname: req.query.entityname,
         action: req.query.action,
         search: req.query.search,
         startDate: req.query.startDate,
         endDate: req.query.endDate,
      }
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

const auditStats = async (req, res, next) => {
  try {
    const stats = await getAuditStats(prisma);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

const getAuditLogById = async (req, res, next) => {
  try {
    const log = await findAuditLogById(prisma, req.params.id);

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Audit log not found',
      });
    }

    return res.json({
      success: true,
      data: log,
    });
  } catch (error) {
    return next(error);
  }
};

const getAuditLogsByRequestId = async (req, res, next) => {
  try {
    const logs = await findAuditLogsByRequestId(
      prisma,
      req.params.requestId
    );

    return res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    return next(error);
  }
};

const exportAuditLogs = async (req, res, next) => {
  try {
    const result = await getAuditLogs(
      prisma,
      1,
      100000,
      {
        entityname: req.query.entityname,
        action: req.query.action,
        search: req.query.search,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      }
    );

    const escapeCsv = (value) =>
      `"${String(value ?? '').replaceAll('"', '""')}"`;

    const headers = [
      'Timestamp',
      'Entity',
      'Entity ID',
      'Action',
      'Actor',
      'Customer ID',
    ];

    const rows = result.data.map((log) => [
      log.createdat?.toISOString(),
      log.entityname,
      log.entityid,
      log.action,
      log.actor || log.createdby,
      log.customerid,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\r\n');

    res
      .type('text/csv')
      .attachment(
        `audit-logs-export-${new Date().toISOString().slice(0, 10)}.csv`
      )
      .send(csv);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listAuditLogs,
  auditStats,
  exportAuditLogs,
  getAuditLogById,
  getAuditLogsByRequestId
};
