import * as policiesService from '../services/policies.service.js';
import asyncHandler from '../utils/asyncHandler.js';


export const createPolicies = asyncHandler(async (req, res) => {
  const created = await policiesService.createPolicies(req.body);
  res.status(201).json({ data: created });
});

export const listPolicies= asyncHandler(async (req, res) => {
  // Empty example — returns zero items by default
  const policies = await policiesService.listPolicies();
  res.json({ data: policies });
});
