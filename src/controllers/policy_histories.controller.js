import * as policyHistoryService from '../services/policy_history.service.js';
import asyncHandler from '../utils/asyncHandler.js';


export const createPolicyHistory = asyncHandler(async (req, res) => {
  const created = await policyHistoryService.createPolicyHistory(req.body);
  res.status(201).json({ data: created });
});


export const listPolicyHistories= asyncHandler(async (req, res) => {
  // Empty example — returns zero items by default
  const histories = await policyHistoryService.listPolicyHistories();
  res.json({ data: histories });
});
