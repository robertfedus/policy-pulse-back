import * as insurance_companiesService from '../services/insurance_companies.service.js';
import asyncHandler from '../utils/asyncHandler.js';


export const createInsuranceCompanies = asyncHandler(async (req, res) => {
  const created = await insurance_companiesService.createInsuranceCompanies(req.body);
  res.status(201).json({ data: created });
});


export const listInsuranceCompanies = asyncHandler(async (req, res) => {
  // Empty example — returns zero items by default
  const companies = await insurance_companiesService.listInsuranceCompanies();
  res.json({ data: companies });
});
