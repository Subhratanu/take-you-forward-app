const express = require('express');
const controller = require('../controllers/auditController');

const router = express.Router();

router.get('/stats', controller.auditStats);
router.get('/request/:requestId', controller.getAuditLogsByRequestId);
router.get('/:id', controller.getAuditLogById);
router.get('/', controller.listAuditLogs);
router.get('/export', controller.exportAuditLogs);

module.exports = router;