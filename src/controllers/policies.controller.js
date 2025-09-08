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

export const getPoliciesById = asyncHandler(async (req, res) => {
  const policy = await policiesService.getPolicies(req.params.id);
  res.json({ data: policy });
});

export const updatePolicies = asyncHandler(async (req, res) => {
  const updated = await policiesService.updatePolicies(req.params.id, req.body);
  res.json({ data: updated });
});

export const deletePolicies = asyncHandler(async (req, res) => {
  await policiesService.deletePolicies(req.params.id);
  res.status(204).send();
} );

export const getPoliciesByInsuranceCompany = asyncHandler(async (req, res) => {   
  const policies = await policiesService.getPoliciesByInsuranceCompany(req.params.insuranceCompanyId);
  res.json({ data: policies });
});