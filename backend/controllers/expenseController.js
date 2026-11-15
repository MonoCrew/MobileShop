const Expense = require("../models/Expense");

/**
 * Standard date range boundary calculator
 */
const getDateRange = (period = "this_month", customFrom, customTo) => {
  const now = new Date();
  let start = null;
  let end = null;
  let label = "This Month";

  if (customFrom || customTo) {
    if (customFrom) {
      start = new Date(customFrom);
      start.setHours(0, 0, 0, 0);
    }
    if (customTo) {
      end = new Date(customTo);
      end.setHours(23, 59, 59, 999);
    }
    return {
      start,
      end,
      period: "custom",
      label: `Custom (${start ? start.toLocaleDateString() : ""} - ${end ? end.toLocaleDateString() : ""})`,
    };
  }

  const p = String(period).toLowerCase().trim();

  switch (p) {
    case "today": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      label = "Today";
      break;
    }
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
      end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
      label = "Yesterday";
      break;
    }
    case "last7days":
    case "last_7_days": {
      start = new Date(now);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      label = "Last 7 Days";
      break;
    }
    case "this_month": {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      label = "This Month";
      break;
    }
    case "last_month": {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      label = "Last Month";
      break;
    }
    case "this_year": {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      label = "This Year";
      break;
    }
    case "all":
    case "all_time": {
      start = null;
      end = null;
      label = "All Time";
      break;
    }
    default: {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      label = "This Month";
      break;
    }
  }

  return { start, end, period: p, label };
};

/**
 * @route   POST /api/expenses
 * @desc    Create a new expense
 */
const createExpense = async (req, res) => {
  try {
    const { title, category, amount, date, recordedBy } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "Expense title/description is required" });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: "Valid expense amount greater than 0 is required" });
    }

    const expenseDate = date ? new Date(date) : new Date();

    const expense = await Expense.create({
      title: title.trim(),
      category: category || "Food & Refreshment",
      amount: parsedAmount,
      date: expenseDate,
      recordedBy: recordedBy ? recordedBy.trim() : "Admin",
    });

    return res.status(201).json({
      success: true,
      message: "Expense recorded successfully",
      expense,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   GET /api/expenses
 * @desc    Get expenses with filtering, pagination, and period summary
 */
const getExpenses = async (req, res) => {
  try {
    const {
      period = "this_month",
      from,
      to,
      startDate,
      endDate,
      category,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const customFrom = from || startDate;
    const customTo = to || endDate;
    const { start, end, label, period: activePeriod } = getDateRange(period, customFrom, customTo);

    const matchQuery = {};

    // Date boundary
    if (start || end) {
      matchQuery.date = {};
      if (start) matchQuery.date.$gte = start;
      if (end) matchQuery.date.$lte = end;
    }

    // Category filter
    if (category && category !== "all" && category.trim() !== "") {
      matchQuery.category = category.trim();
    }

    // Keyword search filter (title or category)
    if (search && search.trim() !== "") {
      const reg = new RegExp(search.trim(), "i");
      matchQuery.$or = [{ title: reg }, { category: reg }];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 20, 1);
    const skip = (pageNum - 1) * limitNum;

    // Today date bounds for today's summary
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Run list query, count, period aggregations, today, and all-time summaries concurrently in a single batch
    const [
      expenses,
      totalMatchingCount,
      summaryRes,
      categoryBreakdown,
      todaySummaryRes,
      allTimeSummaryRes,
    ] = await Promise.all([
      Expense.find(matchQuery)
        .sort({ date: -1, _id: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),

      Expense.countDocuments(matchQuery),

      Expense.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 },
            avgAmount: { $avg: "$amount" },
          },
        },
      ]),

      Expense.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: "$category",
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalAmount: -1 } },
      ]),

      Expense.aggregate([
        { $match: { date: { $gte: todayStart, $lte: todayEnd } } },
        { $group: { _id: null, totalAmount: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),

      Expense.aggregate([
        { $group: { _id: null, totalAmount: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
    ]);

    const summary = summaryRes[0] || { totalAmount: 0, count: 0, avgAmount: 0 };
    const todaySummary = todaySummaryRes[0] || { totalAmount: 0, count: 0 };
    const allTimeSummary = allTimeSummaryRes[0] || { totalAmount: 0, count: 0 };

    return res.status(200).json({
      success: true,
      filter: {
        period: activePeriod,
        label,
        start,
        end,
        category: category || "all",
        search: search || "",
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalMatchingCount / limitNum) || 1,
        totalExpenses: totalMatchingCount,
        limit: limitNum,
      },
      summary: {
        totalAmount: Number(summary.totalAmount.toFixed(2)),
        count: summary.count,
        avgAmount: Number(summary.avgAmount.toFixed(2)),
        todayAmount: Number(todaySummary.totalAmount.toFixed(2)),
        todayCount: todaySummary.count,
        allTimeAmount: Number(allTimeSummary.totalAmount.toFixed(2)),
        allTimeCount: allTimeSummary.count,
        byCategory: categoryBreakdown.map((c) => ({
          category: c._id,
          totalAmount: Number(c.totalAmount.toFixed(2)),
          count: c.count,
        })),
      },
      expenses,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   PUT /api/expenses/:id
 * @desc    Update an expense
 */
const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, category, amount, date } = req.body;

    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense record not found" });
    }

    if (title && title.trim()) expense.title = title.trim();
    if (category) expense.category = category;
    if (amount !== undefined) {
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ success: false, message: "Valid amount greater than 0 required" });
      }
      expense.amount = parsedAmount;
    }
    if (date) expense.date = new Date(date);

    await expense.save();

    return res.status(200).json({
      success: true,
      message: "Expense updated successfully",
      expense,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   DELETE /api/expenses/:id
 * @desc    Delete an expense
 */
const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findByIdAndDelete(id);

    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense record not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Expense deleted successfully",
      id,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createExpense,
  getExpenses,
  updateExpense,
  deleteExpense,
};
