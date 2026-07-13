'use strict';

const Stats = require('../services/stats');
const Sync = require('../services/sync');
const Discount = require('../models/discount');

const DashboardController = {
  index(req, res) {
    const branchId = req.branchScopeId; // null = all branches
    const today = Stats.todayRange();
    const month = Stats.monthRange();

    const totalCollection = Stats.collections({ branchId }).total;
    const totalExpense = Stats.expenses({ branchId }).total;

    const d = {
      students: Stats.studentCount({ branchId }),
      todayCollection: Stats.collections({ branchId, ...today }).total,
      monthCollection: Stats.collections({ branchId, ...month }).total,
      totalCollection,
      totalExpense,
      monthExpense: Stats.expenses({ branchId, ...month }).total,
      netCollection: totalCollection - totalExpense,
      outstanding: Stats.outstanding({ branchId }),
      feeStatus: Stats.feeStatusBreakdown({ branchId }),
      modeDist: Stats.paymentModeDistribution({ branchId }),
      monthly: Stats.monthlyCollection({ branchId }).slice(-12),
      byCourse: Stats.collectionByCourse({ branchId }),
      branchCompare: branchId ? null : Stats.branchComparison(),
      defaulters: Stats.defaulters({ branchId, limit: 8 }),
      recent: Stats.recentReceipts({ branchId, limit: 8 }),
      pendingDiscounts: Discount.count({ branchId, status: 'pending' }),
      sync: Sync.stats(),
    };

    res.render('dashboard/index', { title: 'Dashboard', d, branchId });
  },
};

module.exports = DashboardController;
